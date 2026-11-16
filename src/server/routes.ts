import express, { Request, Response } from 'express';
import { db, generateOfflineAvatarSvg, generateUniqueWorkflowTrackingCode } from './db.js';
import { randomUUID } from 'crypto';
import { createJwtToken, verifyJwtToken } from './jwt.js';
import { isDeadlineExpired } from '../utils/formatters.js';
import { triggerSmsForEvent, sendSmsViaProvider } from './sms.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');
const uploadsDir = path.resolve(projectRoot, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
  } catch (e) {}
}

export const apiRouter = express.Router();

// Helper to get authenticated user from request header or query using JWT
function getCurrentUser(req: Request) {
  const authHeader = req.headers.authorization;
  let rawToken = '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    rawToken = authHeader.substring(7).trim();
  } else if (req.query.userId && typeof req.query.userId === 'string') {
    rawToken = req.query.userId;
  }

  if (!rawToken) return null;

  let userId = '';
  if (rawToken.includes('.')) {
    // Standard JWT token verification
    const decoded = verifyJwtToken(rawToken);
    if (!decoded || !decoded.sub) return null;
    userId = decoded.sub;
  } else {
    // Fallback for raw user id (e.g. backward-compatibility or tests)
    userId = rawToken;
  }

  const user = db.prepare(`
    SELECT u.id, u.username, u.name, u.role, u.positionId, u.avatar, u.phone,
           p.title as positionTitle, p.color as positionColor
    FROM users u
    LEFT JOIN positions p ON u.positionId = p.id
    WHERE u.id = ?
  `).get(userId) as any;

  if (!user) return null;
  const permissions = getUserPermissionsList(user);
  return { ...user, permissions };
}

const EXPLICIT_ONLY_PERMISSIONS = new Set(['projects.manual_approve']);

// Unified helper to get all effective permissions for a user
export function getUserPermissionsList(user: { id: string; role: string; positionId?: string | null; hasCustomPermissions?: number | boolean }): string[] {
  // Check if user has explicit custom permissions configured
  let isCustom = Boolean(user.hasCustomPermissions);
  if (user.hasCustomPermissions === undefined) {
    try {
      const row = db.prepare('SELECT hasCustomPermissions FROM users WHERE id = ?').get(user.id) as any;
      isCustom = Boolean(row?.hasCustomPermissions);
    } catch (e) {}
  }

  const getExplicitUserAndPosPerms = (): Set<string> => {
    const s = new Set<string>();
    try {
      const userP = db.prepare('SELECT permissionCode FROM user_permissions WHERE userId = ?').all(user.id) as { permissionCode: string }[];
      userP.forEach((p) => s.add(p.permissionCode));
    } catch (e) {}
    if (!isCustom) {
      if (user.positionId) {
        try {
          const posP = db.prepare('SELECT permissionCode FROM position_permissions WHERE positionId = ?').all(user.positionId) as { permissionCode: string }[];
          posP.forEach((p) => s.add(p.permissionCode));
        } catch (e) {}
      }
      try {
        const structPosP = db.prepare(`
          SELECT pp.permissionCode
          FROM structure_position_users spu
          JOIN structure_positions sp ON spu.structurePositionId = sp.id
          JOIN position_permissions pp ON sp.positionId = pp.positionId
          WHERE spu.userId = ?
        `).all(user.id) as { permissionCode: string }[];
        structPosP.forEach((p) => s.add(p.permissionCode));
      } catch (e) {}
    }
    return s;
  };

  if (user.role === 'ADMIN') {
    const allP = db.prepare('SELECT code FROM permissions').all() as { code: string }[];
    const explicitSet = getExplicitUserAndPosPerms();
    return allP
      .map((p) => p.code)
      .filter((code) => !EXPLICIT_ONLY_PERMISSIONS.has(code) || explicitSet.has(code));
  }

  if (isCustom) {
    try {
      const userP = db.prepare(`
        SELECT permissionCode FROM user_permissions
        WHERE userId = ?
      `).all(user.id) as { permissionCode: string }[];
      return userP.map((p) => p.permissionCode);
    } catch (e) {}
  }

  return Array.from(getExplicitUserAndPosPerms());
}

// Check permission helper (supports single code or array of acceptable codes)
function hasPermission(user: any, permissionCode: string | string[]): boolean {
  if (!user) return false;
  const perms = Array.isArray(user.permissions) ? user.permissions : [];
  const checkSingle = (c: string) => {
    if (EXPLICIT_ONLY_PERMISSIONS.has(c)) {
      return perms.includes(c);
    }
    return user.role === 'ADMIN' || perms.includes(c);
  };
  if (Array.isArray(permissionCode)) {
    return permissionCode.some((c) => checkSingle(c));
  }
  return checkSingle(permissionCode);
}

// Majority calculator helper
function calculateMajorityForProject(projectId: string) {
  const votes = db.prepare('SELECT status FROM votes WHERE projectId = ?').all(projectId) as { status: string }[];
  if (votes.length === 0) {
    return { majority: 'PENDING', counts: { APPROVED: 0, REJECTED: 0, NEEDS_REVISION: 0, total: 0 } };
  }

  let approved = 0;
  let rejected = 0;
  let needsRevision = 0;

  for (const v of votes) {
    if (v.status === 'APPROVED') approved++;
    else if (v.status === 'REJECTED') rejected++;
    else if (v.status === 'NEEDS_REVISION') needsRevision++;
  }

  const max = Math.max(approved, rejected, needsRevision);
  const ties = [
    approved === max ? 'APPROVED' : null,
    rejected === max ? 'REJECTED' : null,
    needsRevision === max ? 'NEEDS_REVISION' : null,
  ].filter(Boolean);

  let majority = 'PENDING';
  if (ties.length === 1) {
    majority = ties[0] as string;
  } else {
    majority = 'TIED';
  }

  return {
    majority,
    counts: {
      APPROVED: approved,
      REJECTED: rejected,
      NEEDS_REVISION: needsRevision,
      total: votes.length,
    },
  };
}

// Audit & Status History Helper (records every project/workflow operation)
function recordProjectHistory(params: {
  projectId: string;
  stepOrder?: number | null;
  fromUserId: string;
  toPositionId?: string | null;
  action: string;
  comment?: string;
  createdAt?: string;
}) {
  try {
    db.prepare(`
      INSERT INTO workflow_logs (id, projectId, stepOrder, fromUserId, toPositionId, action, comment, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `log-${randomUUID().substring(0, 8)}`,
      params.projectId,
      params.stepOrder || 1,
      params.fromUserId,
      params.toPositionId || null,
      params.action,
      params.comment || '',
      params.createdAt || new Date().toISOString()
    );
  } catch (e) {
    console.error('Failed to record project history:', e);
  }
}

// Mask confidential vote choice inside history logs when viewer lacks voting.confidential.view_all
function sanitizeWorkflowLogsForViewer(logs: any[], viewer: any) {
  const canInspectConfidential = hasPermission(viewer, 'voting.confidential.view_all');
  return logs.map((l) => {
    if (
      !canInspectConfidential &&
      viewer?.id !== l.fromUserId &&
      (l.action === 'VOTE_CAST' || l.action === 'VOTE_UPDATED')
    ) {
      return {
        ...l,
        comment: 'ثبت / بروزرسانی رای تخصصی در کارتابل (محتوای رای محرمانه است)',
      };
    }
    return l;
  });
}

// --------------------------------------------------------------------------
// 1. AUTH & USERS
// --------------------------------------------------------------------------

apiRouter.post('/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'نام کاربری و رمز عبور الزامی است.' });
  }

  const user = db.prepare(`
    SELECT u.id, u.username, u.name, u.role, u.positionId, u.avatar, u.phone,
           p.title as positionTitle, p.color as positionColor
    FROM users u
    LEFT JOIN positions p ON u.positionId = p.id
    WHERE u.username = ? AND u.password = ?
  `).get(username.trim().toLowerCase(), password) as any;

  if (!user) {
    return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است.' });
  }

  const permissions = getUserPermissionsList(user);
  const fullUser = { ...user, permissions };
  const token = createJwtToken({
    sub: user.id,
    username: user.username,
    role: user.role,
  });
  res.json({ token, user: fullUser });
});

apiRouter.get('/auth/me', (req: Request, res: Response) => {
  const user = getCurrentUser(req);
  if (!user) {
    return res.status(401).json({ error: 'کاربر احراز هویت نشده است.' });
  }
  res.json({ user });
});

// User self password change (فقط رمز عبور خودش)
apiRouter.post('/auth/change-password', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'کاربر احراز هویت نشده است.' });
  }

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'رمز عبور فعلی و رمز عبور جدید الزامی هستند.' });
  }

  if (newPassword.trim().length < 4) {
    return res.status(400).json({ error: 'رمز عبور جدید باید حداقل ۴ کاراکتر باشد.' });
  }

  const dbUser = db.prepare('SELECT password FROM users WHERE id = ?').get(currentUser.id) as any;
  if (!dbUser || dbUser.password !== currentPassword) {
    return res.status(400).json({ error: 'رمز عبور فعلی اشتباه است.' });
  }

  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(newPassword.trim(), currentUser.id);
  res.json({ success: true, message: 'رمز عبور با موفقیت تغییر یافت.' });
});

// Forgot password request from login screen (عمومی)
apiRouter.post('/auth/forgot-password', (req: Request, res: Response) => {
  const { username, phone, note } = req.body;
  if (!username || !username.trim()) {
    return res.status(400).json({ error: 'نام کاربری الزامی است.' });
  }

  const cleanUsername = username.trim().toLowerCase();
  const user = db.prepare('SELECT id, name, username, phone FROM users WHERE username = ?').get(cleanUsername) as any;
  if (!user) {
    return res.status(404).json({ error: 'کاربری با این نام کاربری در سامانه یافت نشد.' });
  }

  const now = new Date().toISOString();
  const existingPending = db.prepare("SELECT id FROM password_reset_requests WHERE username = ? AND status = 'PENDING'").get(cleanUsername) as any;

  if (existingPending) {
    db.prepare(`
      UPDATE password_reset_requests
      SET phone = ?, adminNote = ?, requestedAt = ?
      WHERE id = ?
    `).run(phone?.trim() || user.phone || null, note?.trim() || null, now, existingPending.id);
    return res.json({ success: true, requestId: existingPending.id, message: 'درخواست شما از قبل ثبت شده و در انتظار تایید مدیر است.' });
  }

  const reqId = `rst-${randomUUID().substring(0, 8)}`;
  db.prepare(`
    INSERT INTO password_reset_requests (id, userId, username, fullName, phone, status, adminNote, requestedAt)
    VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)
  `).run(reqId, user.id, user.username, user.name, phone?.trim() || user.phone || null, note?.trim() || null, now);

  res.json({ success: true, requestId: reqId, message: 'درخواست تغییر رمز با موفقیت در کارتابل مدیر ثبت شد.' });
});

// Check status of forgot password request (عمومی)
apiRouter.get('/auth/reset-status/:username', (req: Request, res: Response) => {
  const { username } = req.params;
  const cleanUsername = username.trim().toLowerCase();

  const latest = db.prepare(`
    SELECT prr.*, u.name as resolvedByName
    FROM password_reset_requests prr
    LEFT JOIN users u ON prr.resolvedBy = u.id
    WHERE prr.username = ?
    ORDER BY prr.requestedAt DESC
    LIMIT 1
  `).get(cleanUsername) as any;

  if (!latest) {
    return res.json({ found: false });
  }

  res.json({ found: true, request: latest });
});

// Admin list of password reset requests
apiRouter.get('/password-reset-requests', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || (currentUser.role !== 'ADMIN' && !hasPermission(currentUser, 'system.users.edit'))) {
    return res.status(403).json({ error: 'فقط مدیر جلسه مجاز به مشاهده درخواست‌های بازیابی رمز است.' });
  }

  const requests = db.prepare(`
    SELECT prr.*, u.name as resolvedByName
    FROM password_reset_requests prr
    LEFT JOIN users u ON prr.resolvedBy = u.id
    ORDER BY prr.requestedAt DESC
  `).all() as any[];

  res.json({ requests });
});

// Admin resolves (approves with new password or rejects) a reset request
apiRouter.post('/password-reset-requests/:id/resolve', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || (currentUser.role !== 'ADMIN' && !hasPermission(currentUser, 'system.users.edit'))) {
    return res.status(403).json({ error: 'فقط مدیر جلسه مجاز به تایید یا تغییر رمز عبور کاربران است.' });
  }

  const { id } = req.params;
  const { action, newPassword, adminNote } = req.body;

  const currentReq = db.prepare('SELECT * FROM password_reset_requests WHERE id = ?').get(id) as any;
  if (!currentReq) {
    return res.status(404).json({ error: 'درخواست یافت نشد.' });
  }

  const now = new Date().toISOString();

  if (action === 'APPROVE') {
    if (!newPassword || newPassword.trim().length < 4) {
      return res.status(400).json({ error: 'رمز عبور جدید باید حداقل ۴ کاراکتر باشد.' });
    }

    const cleanPass = newPassword.trim();
    const tx = db.transaction(() => {
      // 1. Update user password
      db.prepare('UPDATE users SET password = ? WHERE username = ?').run(cleanPass, currentReq.username);

      // 2. Mark request approved with issued password
      db.prepare(`
        UPDATE password_reset_requests
        SET status = 'APPROVED', newPassword = ?, resolvedAt = ?, resolvedBy = ?, adminNote = ?
        WHERE id = ?
      `).run(cleanPass, now, currentUser.id, adminNote?.trim() || null, id);
    });
    tx();

    // Determine phone number of requester (entered in request or in user profile)
    let recipientPhone = currentReq.phone ? currentReq.phone.trim() : '';
    if (!recipientPhone && currentReq.userId) {
      const u = db.prepare('SELECT phone FROM users WHERE id = ?').get(currentReq.userId) as any;
      if (u?.phone) recipientPhone = u.phone.trim();
    }

    // Trigger SMS notification to user if rule exists
    triggerSmsForEvent({
      eventType: 'PASSWORD_RESET',
      targetUserId: currentReq.userId,
      targetPhone: recipientPhone,
      targetUserName: currentReq.fullName || currentReq.username,
      actor: currentUser,
      extraData: {
        new_password: cleanPass,
        password: cleanPass,
        username: currentReq.username,
        requester_name: currentReq.fullName || currentReq.username,
        admin_note: adminNote?.trim() || '',
      },
    }).catch(console.error);

    return res.json({ success: true, message: `رمز عبور جدید برای کاربر «${currentReq.fullName || currentReq.username}» ثبت گردید.` });
  } else {
    db.prepare(`
      UPDATE password_reset_requests
      SET status = 'REJECTED', resolvedAt = ?, resolvedBy = ?, adminNote = ?
      WHERE id = ?
    `).run(now, currentUser.id, adminNote?.trim() || null, id);

    return res.json({ success: true, message: 'درخواست رد شد.' });
  }
});

apiRouter.get('/users', (_req: Request, res: Response) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.name, u.role, u.positionId, u.avatar, u.phone, u.createdAt,
           p.title as positionTitle, p.color as positionColor
    FROM users u
    LEFT JOIN positions p ON u.positionId = p.id
    ORDER BY u.role DESC, u.name ASC
  `).all() as any[];

  // Attach unified permissions for each user
  const result = users.map((u) => {
    const permissions = getUserPermissionsList(u);
    return { ...u, permissions };
  });

  res.json({ users: result });
});

apiRouter.post('/users', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'system.users.create')) {
    return res.status(403).json({ error: 'شما دسترسی لازم برای تعریف کاربر جدید را ندارید.' });
  }

  const { username, password, name, role, positionId, phone } = req.body;
  if (!username || !password || !name) {
    return res.status(400).json({ error: 'نام، نام کاربری و رمز عبور الزامی هستند.' });
  }

  // STRICT REQUIREMENT: "هرکسی نتونه ادمین اضاف کنه"
  if (role === 'ADMIN' && !hasPermission(currentUser, 'system.users.assign_admin')) {
    return res.status(403).json({
      error: 'خطای عدم دسترسی: شما مجاز به ارتقای کاربر به سطح «مدیر/ادمین» نیستید. این مجوز فقط در اختیار مدیر ارشد است.',
    });
  }

  const id = `usr-${randomUUID().substring(0, 8)}`;
  const avatar = generateOfflineAvatarSvg(name, id);

  try {
    db.prepare(`
      INSERT INTO users (id, username, password, name, role, positionId, avatar, phone, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      username.trim().toLowerCase(),
      password,
      name.trim(),
      role === 'ADMIN' ? 'ADMIN' : 'COUNCIL',
      positionId || null,
      avatar,
      phone || '',
      new Date().toISOString()
    );

    const newUser = db.prepare(`
      SELECT u.id, u.username, u.name, u.role, u.positionId, u.avatar, u.phone, u.createdAt,
             p.title as positionTitle, p.color as positionColor
      FROM users u
      LEFT JOIN positions p ON u.positionId = p.id
      WHERE u.id = ?
    `).get(id);

    res.json({ success: true, user: newUser });
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'این نام کاربری قبلاً در سامانه ثبت شده است.' });
    }
    res.status(500).json({ error: 'خطا در ثبت کاربر جدید.' });
  }
});

apiRouter.put('/users/:id', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'system.users.edit')) {
    return res.status(403).json({ error: 'شما دسترسی لازم برای ویرایش کاربران را ندارید.' });
  }

  const { id } = req.params;
  const { name, role, positionId, phone, password } = req.body;

  // STRICT REQUIREMENT: Prevent appointing admin if lacking permission
  if (role === 'ADMIN' && !hasPermission(currentUser, 'system.users.assign_admin')) {
    const existing = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as any;
    if (existing?.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'خطای عدم دسترسی: شما مجاز به ارتقای کاربر به سطح «مدیر/ادمین» نیستید.',
      });
    }
  }

  try {
    if (password && password.trim()) {
      db.prepare(`
        UPDATE users
        SET name = ?, role = ?, positionId = ?, phone = ?, password = ?
        WHERE id = ?
      `).run(name, role, positionId || null, phone || '', password.trim(), id);
    } else {
      db.prepare(`
        UPDATE users
        SET name = ?, role = ?, positionId = ?, phone = ?
        WHERE id = ?
      `).run(name, role, positionId || null, phone || '', id);
    }

    const updatedUser = db.prepare(`
      SELECT u.id, u.username, u.name, u.role, u.positionId, u.avatar, u.phone, u.createdAt,
             p.title as positionTitle, p.color as positionColor
      FROM users u
      LEFT JOIN positions p ON u.positionId = p.id
      WHERE u.id = ?
    `).get(id);

    res.json({ success: true, user: updatedUser });
  } catch (err: any) {
    res.status(500).json({ error: 'خطا در بروزرسانی کاربر.' });
  }
});

apiRouter.delete('/users/:id', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'system.users.delete')) {
    return res.status(403).json({ error: 'شما مجاز به حذف کاربران نیستید.' });
  }
  const { id } = req.params;
  if (id === currentUser.id) {
    return res.status(400).json({ error: 'شما نمی‌توانید حساب کاربری خودتان را حذف کنید.' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ success: true });
});

// --------------------------------------------------------------------------
// 2. PERMISSIONS TREE (ساختار درختی دسترسی‌ها)
// --------------------------------------------------------------------------

apiRouter.get('/permissions', (_req: Request, res: Response) => {
  const allPerms = db.prepare(`
    SELECT * FROM permissions
    ORDER BY category ASC, code ASC
  `).all() as any[];

  // Organize into tree
  const rootNodes = allPerms.filter((p) => !p.parentCode);
  const tree = rootNodes.map((root) => {
    const children = allPerms.filter((p) => p.parentCode === root.code);
    return {
      ...root,
      children,
    };
  });

  res.json({ permissions: allPerms, tree });
});

apiRouter.get('/positions/:id/permissions', (req: Request, res: Response) => {
  const { id } = req.params;
  const perms = db.prepare(`
    SELECT permissionCode FROM position_permissions
    WHERE positionId = ?
  `).all(id) as { permissionCode: string }[];
  res.json({ permissions: perms.map((p) => p.permissionCode) });
});

apiRouter.put('/positions/:id/permissions', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'system.permissions.manage')) {
    return res.status(403).json({ error: 'تنها مدیر ارشد با مجوز مدیریت دسترسی‌ها امکان تغییر ماتریس مجوزها را دارد.' });
  }

  const { id: positionId } = req.params;
  const { permissions } = req.body as { permissions: string[] };

  if (!Array.isArray(permissions)) {
    return res.status(400).json({ error: 'لیست مجوزها نامعتبر است.' });
  }

  const deleteStmt = db.prepare('DELETE FROM position_permissions WHERE positionId = ?');
  const insertStmt = db.prepare('INSERT INTO position_permissions (positionId, permissionCode) VALUES (?, ?)');

  const tx = db.transaction(() => {
    deleteStmt.run(positionId);
    for (const code of permissions) {
      insertStmt.run(positionId, code);
    }
  });

  tx();

  res.json({ success: true, count: permissions.length });
});

apiRouter.get('/users/:id/permissions', (req: Request, res: Response) => {
  const { id: userId } = req.params;
  const user = db.prepare('SELECT id, name, username, role, positionId, hasCustomPermissions FROM users WHERE id = ?').get(userId) as any;
  if (!user) {
    return res.status(404).json({ error: 'کاربر یافت نشد.' });
  }

  const effective = getUserPermissionsList(user);
  
  // Custom direct user permissions
  const custom = db.prepare('SELECT permissionCode FROM user_permissions WHERE userId = ?').all(userId) as { permissionCode: string }[];
  
  // Inherited position permissions
  const inherited = user.positionId ? (db.prepare('SELECT permissionCode FROM position_permissions WHERE positionId = ?').all(user.positionId) as { permissionCode: string }[]).map(p => p.permissionCode) : [];

  res.json({
    permissions: effective,
    customPermissions: custom.map((c) => c.permissionCode),
    inheritedPermissions: inherited,
    hasCustomPermissions: Boolean(user.hasCustomPermissions),
  });
});

apiRouter.put('/users/:id/permissions', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'system.permissions.manage')) {
    return res.status(403).json({ error: 'تنها مدیر ارشد با مجوز مدیریت دسترسی‌ها امکان تغییر مجوزهای کاربر را دارد.' });
  }

  const { id: userId } = req.params;
  const { permissions } = req.body as { permissions: string[] };

  if (!Array.isArray(permissions)) {
    return res.status(400).json({ error: 'لیست مجوزها نامعتبر است.' });
  }

  const deleteStmt = db.prepare('DELETE FROM user_permissions WHERE userId = ?');
  const insertStmt = db.prepare('INSERT INTO user_permissions (userId, permissionCode) VALUES (?, ?)');
  const updateFlagStmt = db.prepare('UPDATE users SET hasCustomPermissions = 1 WHERE id = ?');

  const tx = db.transaction(() => {
    deleteStmt.run(userId);
    for (const code of permissions) {
      insertStmt.run(userId, code);
    }
    updateFlagStmt.run(userId);
  });

  tx();

  res.json({ success: true, count: permissions.length });
});

apiRouter.post('/users/:id/permissions/reset', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'system.permissions.manage')) {
    return res.status(403).json({ error: 'تنها مدیر ارشد با مجوز مدیریت دسترسی‌ها امکان بازنشانی مجوزها را دارد.' });
  }

  const { id: userId } = req.params;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM user_permissions WHERE userId = ?').run(userId);
    db.prepare('UPDATE users SET hasCustomPermissions = 0 WHERE id = ?').run(userId);
  });
  tx();

  res.json({ success: true });
});

// --------------------------------------------------------------------------
// 3. POSITIONS & ORGANIZATIONAL TREE (ساختار درختی سمت‌ها)
// --------------------------------------------------------------------------

apiRouter.get('/positions', (_req: Request, res: Response) => {
  const positions = db.prepare(`
    SELECT p.*, parent.title as parentTitle
    FROM positions p
    LEFT JOIN positions parent ON p.parentId = parent.id
    ORDER BY p.level ASC, p.orderIndex ASC, p.title ASC
  `).all() as any[];

  // Attach direct users, structure-assigned users, structures, and permissions to each position
  const allUsers = db.prepare(`
    SELECT id, name, username, role, positionId, avatar
    FROM users
  `).all() as any[];

  const allPerms = db.prepare(`
    SELECT positionId, permissionCode FROM position_permissions
  `).all() as any[];

  const structLinks = db.prepare(`
    SELECT sp.positionId, ps.id as structureId, ps.title as structureTitle
    FROM structure_positions sp
    JOIN project_structures ps ON sp.structureId = ps.id
    ORDER BY ps.orderIndex ASC, ps.title ASC
  `).all() as Array<{ positionId: string; structureId: string; structureTitle: string }>;

  const structUsers = db.prepare(`
    SELECT sp.positionId, u.id, u.name, u.username, u.role, u.positionId as userPositionId, u.avatar
    FROM structure_position_users spu
    JOIN structure_positions sp ON spu.structurePositionId = sp.id
    JOIN users u ON spu.userId = u.id
  `).all() as Array<{ positionId: string; id: string; name: string; username: string; role: string; userPositionId?: string; avatar?: string }>;

  const enriched = positions.map((pos) => {
    const userMap = new Map<string, any>();
    for (const u of allUsers) {
      if (u.positionId === pos.id) {
        userMap.set(u.id, u);
      }
    }
    for (const su of structUsers) {
      if (su.positionId === pos.id && !userMap.has(su.id)) {
        userMap.set(su.id, {
          id: su.id,
          name: su.name,
          username: su.username,
          role: su.role,
          positionId: su.userPositionId,
          avatar: su.avatar,
        });
      }
    }
    const posUsers = Array.from(userMap.values());
    const posPerms = allPerms.filter((p) => p.positionId === pos.id).map((p) => p.permissionCode);
    const posStructsMap = new Map<string, { id: string; title: string }>();
    for (const sl of structLinks) {
      if (sl.positionId === pos.id && !posStructsMap.has(sl.structureId)) {
        posStructsMap.set(sl.structureId, { id: sl.structureId, title: sl.structureTitle });
      }
    }
    return {
      ...pos,
      userCount: posUsers.length,
      users: posUsers,
      permissions: posPerms,
      structures: Array.from(posStructsMap.values()),
    };
  });

  res.json({ positions: enriched });
});

apiRouter.post('/positions', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'org.positions.create')) {
    return res.status(403).json({ error: 'شما مجاز به ایجاد سمت و گره جدید در چارت سازمانی نیستید.' });
  }

  const { title, description, color, parentId } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'عنوان سمت الزامی است.' });
  }

  const id = `pos-${randomUUID().substring(0, 8)}`;
  let level = 1;

  if (parentId) {
    const parent = db.prepare('SELECT level FROM positions WHERE id = ?').get(parentId) as any;
    if (parent) {
      level = (parent.level || 1) + 1;
    }
  }

  try {
    db.prepare(`
      INSERT INTO positions (id, title, description, color, parentId, level, orderIndex, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(id, title.trim(), description || '', color || 'indigo', parentId || null, level, new Date().toISOString());

    const created = db.prepare('SELECT * FROM positions WHERE id = ?').get(id);
    res.json({ success: true, position: created });
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'این عنوان سمت قبلاً در چارت ثبت شده است.' });
    }
    res.status(500).json({ error: 'خطا در ثبت سمت جدید.' });
  }
});

apiRouter.put('/positions/:id', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'org.positions.edit')) {
    return res.status(403).json({ error: 'شما مجاز به ویرایش چارت و سمت‌ها نیستید.' });
  }

  const { id } = req.params;
  const { title, description, color, parentId } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'عنوان سمت الزامی است.' });
  }

  // Prevent circular hierarchy
  if (parentId === id) {
    return res.status(400).json({ error: 'یک سمت نمی‌تواند والد خودش باشد.' });
  }

  let level = 1;
  if (parentId) {
    const parent = db.prepare('SELECT level FROM positions WHERE id = ?').get(parentId) as any;
    if (parent) {
      level = (parent.level || 1) + 1;
    }
  }

  db.prepare(`
    UPDATE positions
    SET title = ?, description = ?, color = ?, parentId = ?, level = ?
    WHERE id = ?
  `).run(title.trim(), description || '', color || 'indigo', parentId || null, level, id);

  const updated = db.prepare('SELECT * FROM positions WHERE id = ?').get(id);
  res.json({ success: true, position: updated });
});

apiRouter.delete('/positions/:id', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'org.positions.delete')) {
    return res.status(403).json({ error: 'شما مجاز به حذف سمت‌ها نیستید.' });
  }
  const { id } = req.params;

  // Re-parent children of this node to this node's parent
  const current = db.prepare('SELECT parentId FROM positions WHERE id = ?').get(id) as any;
  const parentId = current?.parentId || null;
  db.prepare('UPDATE positions SET parentId = ? WHERE parentId = ?').run(parentId, id);

  // Detach users
  db.prepare('UPDATE users SET positionId = NULL WHERE positionId = ?').run(id);
  db.prepare('DELETE FROM position_permissions WHERE positionId = ?').run(id);
  db.prepare('DELETE FROM positions WHERE id = ?').run(id);
  res.json({ success: true });
});

// --------------------------------------------------------------------------
// 4. WORKFLOW DEFINITIONS & TRANSITIONS (تعریف و اجرای گردش کار سازمانی)
// --------------------------------------------------------------------------

function parseStepConfig(configJson?: string | null) {
  if (!configJson) return {};
  try {
    return JSON.parse(configJson);
  } catch {
    return {};
  }
}

function parseStepPositionIds(step: any): string[] {
  if (!step) return [];
  if (Array.isArray(step.positionIds) && step.positionIds.length > 0) {
    return Array.from(new Set(step.positionIds.filter((id: any) => typeof id === 'string' && id.trim())));
  }
  if (step.positionIdsJson) {
    try {
      const parsed = JSON.parse(step.positionIdsJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return Array.from(new Set(parsed.filter((id: any) => typeof id === 'string' && id.trim())));
      }
    } catch {}
  }
  return step.positionId ? [step.positionId] : [];
}

function getPositionsLookupMap() {
  const rows = db.prepare('SELECT id, title, color FROM positions').all() as Array<{ id: string; title: string; color?: string }>;
  const map = new Map<string, { id: string; title: string; color?: string }>();
  for (const r of rows) {
    map.set(r.id, r);
  }
  return map;
}

function enrichStepObject(step: any, posMap: Map<string, { id: string; title: string; color?: string }>) {
  const positionIds = parseStepPositionIds(step);
  const positions = positionIds
    .map((pid) => posMap.get(pid))
    .filter((p): p is { id: string; title: string; color?: string } => Boolean(p));

  if (positions.length === 0 && step.positionId && step.positionTitle) {
    positions.push({ id: step.positionId, title: step.positionTitle, color: step.positionColor });
  }

  return {
    ...step,
    positionId: positionIds[0] || step.positionId,
    positionIds,
    positions,
    positionTitle: positions.length > 0 ? positions.map((p) => p.title).join('، ') : step.positionTitle,
    config: parseStepConfig(step.configJson),
  };
}

function resolveAssigneesForStepPositions(
  positionIds: string[],
  structureId: string | null | undefined,
  allUsers: any[],
  structAssignments: Array<{ userId: string; positionId: string; structureId: string; structureTitle?: string }>,
  posMap?: Map<string, { id: string; title: string; color?: string }>,
  explicitUserIds?: string[]
) {
  const hasExplicitUsers = Array.isArray(explicitUserIds) && explicitUserIds.length > 0;
  if ((!positionIds || positionIds.length === 0) && !hasExplicitUsers) return [];
  const targetPosSet = new Set(positionIds || []);
  const map = new Map<string, {
    id: string;
    name: string;
    username: string;
    avatar?: string;
    phone?: string;
    role: string;
    positionTitle?: string;
    sources: string[];
  }>();

  const getPosLabel = (pid: string) => posMap?.get(pid)?.title || 'سمت سازمانی';

  // Direct primary position holders across ALL parallel positions in the step
  for (const u of allUsers) {
    if (u.positionId && targetPosSet.has(u.positionId)) {
      const src = positionIds.length > 1 ? `سمت: ${getPosLabel(u.positionId)}` : 'سمت سازمانی اصلی';
      map.set(u.id, {
        id: u.id,
        name: u.name,
        username: u.username,
        avatar: u.avatar,
        phone: u.phone,
        role: u.role,
        positionTitle: u.positionTitle,
        sources: [src],
      });
    }
  }

  // Structure-specific position holders across ALL parallel positions in the step
  for (const sa of structAssignments) {
    if (targetPosSet.has(sa.positionId) && (!structureId || sa.structureId === structureId)) {
      const u = allUsers.find((usr) => usr.id === sa.userId);
      if (!u) continue;
      const posPrefix = positionIds.length > 1 ? ` (${getPosLabel(sa.positionId)})` : '';
      const srcLabel = (sa.structureTitle ? `ساختار: ${sa.structureTitle}` : 'ساختار سازمانی') + posPrefix;
      const existing = map.get(u.id);
      if (existing) {
        if (!existing.sources.includes(srcLabel)) existing.sources.push(srcLabel);
      } else {
        map.set(u.id, {
          id: u.id,
          name: u.name,
          username: u.username,
          avatar: u.avatar,
          phone: u.phone,
          role: u.role,
          positionTitle: u.positionTitle,
          sources: [srcLabel],
        });
      }
    }
  }

  // Explicit per-step users (if configured in step.config.userIds)
  if (hasExplicitUsers) {
    for (const uid of explicitUserIds!) {
      const u = allUsers.find((usr) => usr.id === uid);
      if (!u) continue;
      const existing = map.get(u.id);
      if (existing) {
        if (!existing.sources.includes('انتخاب مستقیم در مرحله')) {
          existing.sources.push('انتخاب مستقیم در مرحله');
        }
      } else {
        map.set(u.id, {
          id: u.id,
          name: u.name,
          username: u.username,
          avatar: u.avatar,
          phone: u.phone,
          role: u.role,
          positionTitle: u.positionTitle,
          sources: ['انتخاب مستقیم در مرحله'],
        });
      }
    }
  }

  return Array.from(map.values());
}

function getRequiredApprovalsForMode(mode: string | undefined, totalAssignees: number): number {
  const n = Math.max(1, totalAssignees);
  if (mode === 'ALL') return n;
  if (mode === 'MAJORITY') return Math.floor(n / 2) + 1;
  return 1;
}

function buildStepApprovalProgress(
  projectId: string,
  stepOrder: number,
  approvalMode: string | undefined,
  assignees: any[],
  viewerUserId?: string
) {
  const mode = (approvalMode || 'SINGLE') as 'SINGLE' | 'MAJORITY' | 'ALL' | 'NOTIFY_ONLY';
  const rows = db.prepare(`
    SELECT wsa.userId, wsa.createdAt, COALESCE(wsa.decision, 'APPROVE') as decision, u.name as userName, p.title as positionTitle
    FROM workflow_step_approvals wsa
    JOIN users u ON wsa.userId = u.id
    LEFT JOIN positions p ON u.positionId = p.id
    WHERE wsa.projectId = ? AND wsa.stepOrder = ?
    ORDER BY wsa.createdAt ASC
  `).all(projectId, stepOrder) as Array<{ userId: string; userName: string; positionTitle?: string; decision: string; createdAt: string }>;

  const approvedRows = rows.filter((r) => r.decision !== 'REJECT');
  const rejectedRows = rows.filter((r) => r.decision === 'REJECT');

  const requiredCount = getRequiredApprovalsForMode(mode, assignees.length);
  const rejectRequiredCount =
    mode === 'MAJORITY'
      ? Math.max(1, Math.max(1, assignees.length) - requiredCount + 1)
      : 1;

  return {
    mode,
    approvedUserIds: approvedRows.map((r) => r.userId),
    approvedUsers: approvedRows,
    rejectedUserIds: rejectedRows.map((r) => r.userId),
    rejectedUsers: rejectedRows,
    totalAssignees: assignees.length,
    requiredCount,
    rejectRequiredCount,
    hasCurrentUserApproved: Boolean(viewerUserId && approvedRows.some((r) => r.userId === viewerUserId)),
    hasCurrentUserRejected: Boolean(viewerUserId && rejectedRows.some((r) => r.userId === viewerUserId)),
  };
}

apiRouter.get('/workflows', (_req: Request, res: Response) => {
  const workflows = db.prepare('SELECT * FROM workflows ORDER BY isDefault DESC, title ASC').all() as any[];
  const steps = db.prepare(`
    SELECT s.*, p.title as positionTitle, p.color as positionColor, ps.title as structureTitle
    FROM workflow_steps s
    LEFT JOIN positions p ON s.positionId = p.id
    LEFT JOIN project_structures ps ON s.structureId = ps.id
    ORDER BY s.workflowId ASC, s.stepOrder ASC
  `).all() as any[];

  const posMap = getPositionsLookupMap();

  const result = workflows.map((wf) => {
    const wfSteps = steps
      .filter((s) => s.workflowId === wf.id)
      .map((s) => enrichStepObject(s, posMap));
    return {
      ...wf,
      steps: wfSteps,
    };
  });

  res.json({ workflows: result });
});

apiRouter.get('/workflows/tracking', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'کاربر احراز هویت نشده است.' });
  }
  if (
    !hasPermission(currentUser, [
      'workflow.view',
      'workflow.history.view',
      'workflow.create',
      'workflow.edit',
      'workflow.delete',
      'projects.view',
    ])
  ) {
    return res.status(403).json({ error: 'شما مجوز مشاهده و رهگیری گردش کارها را ندارید.' });
  }
  const canViewAllProjects = hasPermission(currentUser, 'projects.view');

  const projects = db.prepare(`
    SELECT p.*, u.name as creatorName, u.username as creatorUsername,
           uPos.title as creatorPositionTitle,
           w.title as workflowTitle,
           pos.title as currentPositionTitle, pos.color as currentPositionColor
    FROM projects p
    LEFT JOIN users u ON p.createdById = u.id
    LEFT JOIN positions uPos ON u.positionId = uPos.id
    LEFT JOIN workflows w ON p.workflowId = w.id
    LEFT JOIN positions pos ON p.currentPositionId = pos.id
    ORDER BY p.createdAt DESC
  `).all() as any[];

  const allStepsRaw = db.prepare(`
    SELECT s.*, p.title as positionTitle, p.color as positionColor, ps.title as structureTitle
    FROM workflow_steps s
    LEFT JOIN positions p ON s.positionId = p.id
    LEFT JOIN project_structures ps ON s.structureId = ps.id
    ORDER BY s.stepOrder ASC
  `).all() as any[];

  const posMap = getPositionsLookupMap();
  const allSteps = allStepsRaw.map((s) => enrichStepObject(s, posMap));

  const allLogsRaw = db.prepare(`
    SELECT l.*, u.name as fromUserName, u.username as fromUsername, pos.title as toPositionTitle, uPos.title as fromUserPosition
    FROM workflow_logs l
    JOIN users u ON l.fromUserId = u.id
    LEFT JOIN positions uPos ON u.positionId = uPos.id
    LEFT JOIN positions pos ON l.toPositionId = pos.id
    ORDER BY l.createdAt ASC
  `).all() as any[];
  const allLogs = sanitizeWorkflowLogsForViewer(allLogsRaw, currentUser);

  const allUsers = db.prepare(`
    SELECT u.id, u.username, u.name, u.role, u.positionId, u.avatar, u.phone,
           p.title as positionTitle, p.color as positionColor
    FROM users u
    LEFT JOIN positions p ON u.positionId = p.id
  `).all() as any[];

  const structAssignments = db.prepare(`
    SELECT spu.userId, sp.positionId, sp.structureId, ps.title as structureTitle
    FROM structure_position_users spu
    JOIN structure_positions sp ON spu.structurePositionId = sp.id
    LEFT JOIN project_structures ps ON sp.structureId = ps.id
  `).all() as Array<{ userId: string; positionId: string; structureId: string; structureTitle?: string }>;

  let items = projects.map((prj) => {
    const prjStepsRaw = prj.workflowId ? allSteps.filter((s) => s.workflowId === prj.workflowId) : [];
    const steps = prjStepsRaw.map((st) => ({
      ...st,
      assignees: resolveAssigneesForStepPositions(
        st.positionIds,
        st.structureId,
        allUsers,
        structAssignments,
        posMap,
        st.config?.userIds
      ),
    }));
    const currentStep = steps.find((s) => s.stepOrder === (prj.currentStepOrder || 1)) || null;
    const currentPositionIds: string[] = currentStep
      ? (currentStep.positionIds || [])
      : prj.currentPositionId
      ? [String(prj.currentPositionId)]
      : [];
    const currentPositions = currentPositionIds
      .map((pid: string) => posMap.get(pid))
      .filter((p: { id: string; title: string; color?: string } | undefined): p is { id: string; title: string; color?: string } => Boolean(p));

    const isCompletedOrRejected = prj.status === 'APPROVED' || prj.status === 'REJECTED';
    const currentAssignees = isCompletedOrRejected
      ? []
      : resolveAssigneesForStepPositions(
          currentPositionIds,
          currentStep?.structureId || null,
          allUsers,
          structAssignments,
          posMap,
          currentStep?.config?.userIds
        );

    const currentStepApprovalProgress = isCompletedOrRejected
      ? null
      : buildStepApprovalProgress(
          prj.id,
          prj.currentStepOrder || 1,
          currentStep?.config?.approvalMode,
          currentAssignees,
          currentUser.id
        );

    const logs = allLogs.filter((l) => l.projectId === prj.id);
    const expired = isDeadlineExpired(prj.deadline);

    const isMyWorkflowTurn =
      Boolean(prj.workflowId && steps.length > 0 && !isCompletedOrRejected) &&
      currentAssignees.some((a) => a.id === currentUser.id);

    return {
      projectId: prj.id,
      projectTitle: prj.title,
      projectCode: prj.code,
      workflowTrackingCode: prj.workflowTrackingCode || '',
      productionType: prj.productionType || '',
      budgetEstimated: prj.budgetEstimated || '',
      deadline: prj.deadline || '',
      deliveryDate: prj.deliveryDate || '',
      isDeadlineExpired: expired,
      status: prj.status,
      majorityResult: prj.majorityResult,
      workflowId: prj.workflowId || null,
      workflowTitle: prj.workflowId ? (prj.workflowTitle || 'گردش کار') : 'بدون گردش کار',
      currentStepOrder: prj.currentStepOrder || 1,
      totalSteps: steps.length,
      currentStepTitle: currentStep?.title || '',
      currentStepActionType: currentStep?.actionType || '',
      currentStructureId: currentStep?.structureId || null,
      currentStructureTitle: currentStep?.structureTitle || null,
      currentPositionId: prj.currentPositionId || currentPositionIds[0] || null,
      currentPositionIds,
      currentPositions,
      currentPositionTitle:
        currentPositions.length > 0
          ? currentPositions.map((p) => p.title).join('، ')
          : prj.currentPositionTitle || currentStep?.positionTitle || null,
      currentPositionColor: prj.currentPositionColor || currentStep?.positionColor || 'indigo',
      currentAssignees,
      currentStepApprovalProgress,
      isMyWorkflowTurn,
      creatorId: prj.createdById || null,
      creatorName: prj.creatorName || 'نامشخص',
      creatorUsername: prj.creatorUsername || '',
      creatorPositionTitle: prj.creatorPositionTitle || '',
      createdAt: prj.createdAt,
      updatedAt: prj.updatedAt,
      steps,
      logs,
    };
  });

  if (!canViewAllProjects) {
    items = items.filter((it) => Boolean(it.isMyWorkflowTurn));
  }

  // Apply optional query filters
  const qSearch = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const qCode = typeof req.query.code === 'string' ? req.query.code.trim().toLowerCase() : '';
  const effectiveSearch = qCode || qSearch;
  const qPersonId = typeof req.query.personId === 'string' ? req.query.personId.trim() : '';
  const qPersonRole = typeof req.query.personRole === 'string' ? req.query.personRole.trim() : 'CURRENT_ASSIGNEE';
  const qWorkflowId = typeof req.query.workflowId === 'string' ? req.query.workflowId.trim() : '';
  const qPositionId = typeof req.query.positionId === 'string' ? req.query.positionId.trim() : '';
  const qStatus = typeof req.query.status === 'string' ? req.query.status.trim() : '';
  const qDateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom.trim() : '';
  const qDateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo.trim() : '';
  const qDeadlineState = typeof req.query.deadlineState === 'string' ? req.query.deadlineState.trim() : '';
  const qAction = typeof req.query.action === 'string' ? req.query.action.trim() : '';

  if (effectiveSearch) {
    items = items.filter(
      (it) =>
        it.workflowTrackingCode.toLowerCase().includes(effectiveSearch) ||
        it.projectCode.toLowerCase().includes(effectiveSearch) ||
        it.projectTitle.toLowerCase().includes(effectiveSearch) ||
        it.workflowTitle.toLowerCase().includes(effectiveSearch) ||
        (it.currentPositionTitle || '').toLowerCase().includes(effectiveSearch) ||
        it.currentAssignees.some(
          (a) =>
            a.name.toLowerCase().includes(effectiveSearch) ||
            a.username.toLowerCase().includes(effectiveSearch)
        )
    );
  }
  if (qPersonId) {
    items = items.filter((it) => {
      if (qPersonRole === 'CREATOR') return it.creatorId === qPersonId;
      if (qPersonRole === 'ANY') {
        return (
          it.creatorId === qPersonId ||
          it.currentAssignees.some((a) => a.id === qPersonId) ||
          it.logs.some((l) => l.fromUserId === qPersonId)
        );
      }
      return it.currentAssignees.some((a) => a.id === qPersonId);
    });
  }
  if (qWorkflowId) {
    items = items.filter((it) => it.workflowId === qWorkflowId);
  }
  if (qPositionId) {
    items = items.filter(
      (it) => it.currentPositionId === qPositionId || (it.currentPositionIds && it.currentPositionIds.includes(qPositionId))
    );
  }
  if (qStatus) {
    items = items.filter((it) => it.status === qStatus);
  }
  if (qDateFrom) {
    items = items.filter((it) => (it.createdAt || '').slice(0, 10) >= qDateFrom);
  }
  if (qDateTo) {
    items = items.filter((it) => (it.createdAt || '').slice(0, 10) <= qDateTo);
  }
  if (qDeadlineState === 'EXPIRED') {
    items = items.filter((it) => it.isDeadlineExpired);
  } else if (qDeadlineState === 'ACTIVE') {
    items = items.filter((it) => !it.isDeadlineExpired);
  }
  if (qAction) {
    items = items.filter((it) => it.logs.some((l: any) => l.action === qAction));
  }

  res.json({ items });
});

apiRouter.post('/workflows', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'workflow.create')) {
    return res.status(403).json({ error: 'شما مجاز به طراحی و تعریف فرآیند گردش کار نیستید.' });
  }

  const { title, description, isDefault, steps } = req.body;
  if (!title || !title.trim() || !Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ error: 'عنوان گردش کار و حداقل یک مرحله الزامی است.' });
  }

  for (let i = 0; i < steps.length; i++) {
    const posIds = parseStepPositionIds(steps[i]);
    if (posIds.length === 0) {
      return res.status(400).json({ error: `برای گام ${i + 1} حداقل یک سمت سازمانی انتخاب کنید.` });
    }
  }

  const id = `wf-${randomUUID().substring(0, 8)}`;
  const now = new Date().toISOString();

  const insertWf = db.prepare('INSERT INTO workflows (id, title, description, isDefault, createdAt) VALUES (?, ?, ?, ?, ?)');
  const insertStep = db.prepare(`
    INSERT INTO workflow_steps (id, workflowId, stepOrder, title, structureId, positionId, positionIdsJson, actionType, description, configJson)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    if (isDefault) {
      db.prepare('UPDATE workflows SET isDefault = 0').run();
    }
    insertWf.run(id, title.trim(), description || '', isDefault ? 1 : 0, now);
    steps.forEach((s: any, idx: number) => {
      const cfg = s.config || parseStepConfig(s.configJson);
      const posIds = parseStepPositionIds(s);
      insertStep.run(
        `st-${randomUUID().substring(0, 8)}`,
        id,
        idx + 1,
        s.title || `گام ${idx + 1}`,
        s.structureId || null,
        posIds[0],
        JSON.stringify(posIds),
        s.actionType || 'APPROVAL',
        s.description || '',
        JSON.stringify(cfg || {})
      );
    });
  });

  tx();

  res.json({ success: true, workflowId: id });
});

apiRouter.put('/workflows/:id', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'workflow.edit')) {
    return res.status(403).json({ error: 'شما مجاز به ویرایش فرآیند گردش کار نیستید.' });
  }

  const { id } = req.params;
  const { title, description, isDefault, steps } = req.body;
  if (!title || !title.trim() || !Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ error: 'عنوان گردش کار و حداقل یک مرحله الزامی است.' });
  }

  for (let i = 0; i < steps.length; i++) {
    const posIds = parseStepPositionIds(steps[i]);
    if (posIds.length === 0) {
      return res.status(400).json({ error: `برای گام ${i + 1} حداقل یک سمت سازمانی انتخاب کنید.` });
    }
  }

  const tx = db.transaction(() => {
    if (isDefault) {
      db.prepare('UPDATE workflows SET isDefault = 0 WHERE id != ?').run(id);
    }
    db.prepare('UPDATE workflows SET title = ?, description = ?, isDefault = ? WHERE id = ?')
      .run(title.trim(), description || '', isDefault ? 1 : 0, id);

    db.prepare('DELETE FROM workflow_steps WHERE workflowId = ?').run(id);

    const insertStep = db.prepare(`
      INSERT INTO workflow_steps (id, workflowId, stepOrder, title, structureId, positionId, positionIdsJson, actionType, description, configJson)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    steps.forEach((s: any, idx: number) => {
      const cfg = s.config || parseStepConfig(s.configJson);
      const posIds = parseStepPositionIds(s);
      insertStep.run(
        s.id && !s.id.startsWith('new-') ? s.id : `st-${randomUUID().substring(0, 8)}`,
        id,
        idx + 1,
        s.title || `گام ${idx + 1}`,
        s.structureId || null,
        posIds[0],
        JSON.stringify(posIds),
        s.actionType || 'APPROVAL',
        s.description || '',
        JSON.stringify(cfg || {})
      );
    });
  });

  tx();

  res.json({ success: true });
});

apiRouter.delete('/workflows/:id', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'workflow.delete')) {
    return res.status(403).json({ error: 'شما مجاز به حذف گردش کار نیستید.' });
  }

  const { id } = req.params;
  const activeCount = (db.prepare('SELECT count(*) as count FROM projects WHERE workflowId = ?').get(id) as any)?.count || 0;
  if (activeCount > 0) {
    return res.status(400).json({ error: `تعداد ${activeCount} پروژه در حال حاضر از این فرآیند گردش کار استفاده می‌کنند و امکان حذف مستقیم وجود ندارد.` });
  }

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM workflow_steps WHERE workflowId = ?').run(id);
    db.prepare('DELETE FROM workflows WHERE id = ?').run(id);
  });
  tx();

  res.json({ success: true });
});

apiRouter.post('/workflows/:id/set-default', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'workflow.edit')) {
    return res.status(403).json({ error: 'شما مجاز به تعیین گردش کار پیش‌فرض نیستید.' });
  }
  const { id } = req.params;

  const tx = db.transaction(() => {
    db.prepare('UPDATE workflows SET isDefault = 0').run();
    db.prepare('UPDATE workflows SET isDefault = 1 WHERE id = ?').run(id);
  });
  tx();

  res.json({ success: true });
});

apiRouter.post('/projects/:id/workflow-transition', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'workflow.forward')) {
    return res.status(403).json({ error: 'شما مجاز به ارجاع در گردش کار نیستید.' });
  }

  const { id: projectId } = req.params;
  const { action, comment, nextStepOrder, nextPositionId, adminOverride } = req.body;

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
  if (!project) {
    return res.status(404).json({ error: 'پروژه یافت نشد.' });
  }
  if (project.status === 'APPROVED' || project.status === 'REJECTED') {
    return res.status(400).json({ error: 'این پروژه قبلاً در گردش کار نهایی و مختومه شده است.' });
  }

  const now = new Date().toISOString();
  const logId = `log-${randomUUID().substring(0, 8)}`;

  // Find steps for project workflow
  const steps = db.prepare(`
    SELECT * FROM workflow_steps
    WHERE workflowId = ?
    ORDER BY stepOrder ASC
  `).all(project.workflowId || 'wf-standard') as any[];

  let targetStepOrder = project.currentStepOrder || 1;
  let targetPositionId = project.currentPositionId;
  let newStatus = project.status;
  const currentStep = steps.find((s) => s.stepOrder === (project.currentStepOrder || 1));
  const currentConfig = parseStepConfig(currentStep?.configJson);
  const currentPosIds = parseStepPositionIds(currentStep);

  // Resolve current step assignees for turn guard & approval quorum checks (MAJORITY / ALL)
  const allUsers = db.prepare(`
    SELECT u.id, u.username, u.name, u.role, u.positionId, p.title as positionTitle
    FROM users u
    LEFT JOIN positions p ON u.positionId = p.id
  `).all() as any[];
  const structAssignments = db.prepare(`
    SELECT spu.userId, sp.positionId, sp.structureId, ps.title as structureTitle
    FROM structure_position_users spu
    JOIN structure_positions sp ON spu.structurePositionId = sp.id
    LEFT JOIN project_structures ps ON sp.structureId = ps.id
  `).all() as Array<{ userId: string; positionId: string; structureId: string; structureTitle?: string }>;
  const stepAssignees = resolveAssigneesForStepPositions(
    currentPosIds,
    currentStep?.structureId || null,
    allUsers,
    structAssignments,
    undefined,
    currentConfig.userIds
  );

  const isAssignee = stepAssignees.some((a) => a.id === currentUser.id);
  if (!isAssignee) {
    if (currentUser.role !== 'ADMIN') {
      const holderNames = stepAssignees.map((a) => a.name).join('، ');
      return res.status(403).json({
        error: holderNames
          ? `نوبت بررسی این مرحله در کارتابل شما نیست. متصدی(ان) فعلی: ${holderNames}`
          : 'نوبت بررسی این مرحله در کارتابل شما نیست.',
      });
    }
    if (!adminOverride) {
      return res.status(400).json({
        error: 'این مرحله در نوبت کارتابل سمت دیگری است؛ برای اقدام مدیریتی خارج از نوبت، گزینه مربوطه را در فرم تایید کنید.',
      });
    }
  }

  const approvalMode = currentConfig.approvalMode || 'SINGLE';

  if (action === 'FORWARD' || action === 'APPROVED') {
    if (approvalMode === 'MAJORITY' || approvalMode === 'ALL') {
      db.prepare(`
        INSERT INTO workflow_step_approvals (id, projectId, stepOrder, userId, positionId, decision, comment, createdAt)
        VALUES (?, ?, ?, ?, ?, 'APPROVE', ?, ?)
        ON CONFLICT(projectId, stepOrder, userId) DO UPDATE SET
          decision = 'APPROVE',
          comment = excluded.comment,
          createdAt = excluded.createdAt
      `).run(
        `wsa-${randomUUID().substring(0, 8)}`,
        projectId,
        project.currentStepOrder || 1,
        currentUser.id,
        currentUser.positionId || currentPosIds[0] || null,
        comment || '',
        now
      );

      const currentVotes = db.prepare(`
        SELECT userId, COALESCE(decision, 'APPROVE') as decision FROM workflow_step_approvals
        WHERE projectId = ? AND stepOrder = ?
      `).all(projectId, project.currentStepOrder || 1) as Array<{ userId: string; decision: string }>;

      const currentApprovals = currentVotes.filter((v) => v.decision !== 'REJECT');
      const currentRejections = currentVotes.filter((v) => v.decision === 'REJECT');

      const assigneeSet = new Set(stepAssignees.map((a) => a.id));
      const matchedApprovalCount =
        stepAssignees.length > 0
          ? currentApprovals.filter((a) => assigneeSet.has(a.userId)).length
          : currentApprovals.length;
      const effectiveApprovedCount =
        stepAssignees.length > 0
          ? adminOverride
            ? Math.max(matchedApprovalCount, currentApprovals.length)
            : matchedApprovalCount
          : currentApprovals.length;
      const matchedRejectCount =
        stepAssignees.length > 0
          ? currentRejections.filter((a) => assigneeSet.has(a.userId)).length
          : currentRejections.length;
      const requiredCount = getRequiredApprovalsForMode(approvalMode, stepAssignees.length);
      const rejectRequiredCount =
        approvalMode === 'MAJORITY'
          ? Math.max(1, Math.max(1, stepAssignees.length) - requiredCount + 1)
          : 1;

      if (effectiveApprovedCount < requiredCount) {
        const stepNote = `تایید در مرحله «${currentStep?.title || `گام ${project.currentStepOrder}`}» ثبت شد (${effectiveApprovedCount} از ${requiredCount} رای موافق لازم)${comment ? ` — ${comment}` : ''}`;
        db.prepare(`
          INSERT INTO workflow_logs (id, projectId, stepOrder, fromUserId, toPositionId, action, comment, createdAt)
          VALUES (?, ?, ?, ?, ?, 'STEP_APPROVED', ?, ?)
        `).run(
          logId,
          projectId,
          project.currentStepOrder || 1,
          currentUser.id,
          currentPosIds[0] || project.currentPositionId || null,
          stepNote,
          now
        );

        db.prepare('UPDATE projects SET updatedAt = ? WHERE id = ?').run(now, projectId);

        return res.json({
          success: true,
          advanced: false,
          approvedCount: effectiveApprovedCount,
          rejectedCount: matchedRejectCount,
          requiredCount,
          rejectRequiredCount,
          totalAssignees: stepAssignees.length,
          currentStepOrder: project.currentStepOrder || 1,
          currentPositionId: project.currentPositionId,
          status: project.status,
        });
      }
    }

    // Threshold met (or SINGLE / NOTIFY_ONLY): clear step approvals and advance
    db.prepare('DELETE FROM workflow_step_approvals WHERE projectId = ? AND stepOrder = ?')
      .run(projectId, project.currentStepOrder || 1);

    const isCurrentlyLastStep = steps.length === 0 || (project.currentStepOrder || 1) >= steps.length;
    if (nextStepOrder) {
      targetStepOrder = nextStepOrder;
    } else if (
      currentConfig.onApproveStepOrder &&
      currentConfig.onApproveStepOrder >= 1 &&
      currentConfig.onApproveStepOrder <= steps.length
    ) {
      targetStepOrder = currentConfig.onApproveStepOrder;
    } else {
      targetStepOrder = Math.min(Math.max(1, steps.length), (project.currentStepOrder || 1) + 1);
    }

    const targetStep = steps.find((s) => s.stepOrder === targetStepOrder);
    const targetPosIds = parseStepPositionIds(targetStep);
    targetPositionId = nextPositionId || targetPosIds[0] || project.currentPositionId;

    if (isCurrentlyLastStep && targetStepOrder >= Math.max(1, steps.length)) {
      newStatus = 'APPROVED';
    } else {
      newStatus = 'IN_REVIEW';
    }
  } else if (action === 'NEEDS_REVISION') {
    const rejectRule = currentConfig.onRejectAction || 'RETURN_PREV';
    if (rejectRule === 'REJECT_PROJECT') {
      newStatus = 'REJECTED';
    } else if (rejectRule === 'RETURN_CREATOR') {
      newStatus = 'NEEDS_REVISION';
      targetStepOrder = 1;
      const targetStep = steps.find((s) => s.stepOrder === 1);
      targetPositionId = parseStepPositionIds(targetStep)[0] || project.currentPositionId;
    } else if (rejectRule === 'CUSTOM_STEP' && currentConfig.onRejectStepOrder) {
      newStatus = 'NEEDS_REVISION';
      targetStepOrder = Math.min(steps.length, Math.max(1, currentConfig.onRejectStepOrder));
      const targetStep = steps.find((s) => s.stepOrder === targetStepOrder);
      targetPositionId = parseStepPositionIds(targetStep)[0] || project.currentPositionId;
    } else {
      newStatus = 'NEEDS_REVISION';
      targetStepOrder = Math.max(1, (project.currentStepOrder || 1) - 1);
      const targetStep = steps.find((s) => s.stepOrder === targetStepOrder);
      targetPositionId = parseStepPositionIds(targetStep)[0] || project.currentPositionId;
    }
    db.prepare('DELETE FROM workflow_step_approvals WHERE projectId = ? AND stepOrder >= ?')
      .run(projectId, targetStepOrder);
  } else if (action === 'REJECTED') {
    if (approvalMode === 'MAJORITY' && stepAssignees.length > 1) {
      db.prepare(`
        INSERT INTO workflow_step_approvals (id, projectId, stepOrder, userId, positionId, decision, comment, createdAt)
        VALUES (?, ?, ?, ?, ?, 'REJECT', ?, ?)
        ON CONFLICT(projectId, stepOrder, userId) DO UPDATE SET
          decision = 'REJECT',
          comment = excluded.comment,
          createdAt = excluded.createdAt
      `).run(
        `wsa-${randomUUID().substring(0, 8)}`,
        projectId,
        project.currentStepOrder || 1,
        currentUser.id,
        currentUser.positionId || currentPosIds[0] || null,
        comment || '',
        now
      );

      const currentVotes = db.prepare(`
        SELECT userId, COALESCE(decision, 'APPROVE') as decision FROM workflow_step_approvals
        WHERE projectId = ? AND stepOrder = ?
      `).all(projectId, project.currentStepOrder || 1) as Array<{ userId: string; decision: string }>;

      const currentApprovals = currentVotes.filter((v) => v.decision !== 'REJECT');
      const currentRejections = currentVotes.filter((v) => v.decision === 'REJECT');

      const assigneeSet = new Set(stepAssignees.map((a) => a.id));
      const matchedApproveCount = currentApprovals.filter((a) => assigneeSet.has(a.userId)).length;
      const matchedRejectCount = currentRejections.filter((a) => assigneeSet.has(a.userId)).length;
      const effectiveRejectedCount = adminOverride
        ? Math.max(matchedRejectCount, currentRejections.length)
        : matchedRejectCount;

      const requiredCount = getRequiredApprovalsForMode('MAJORITY', stepAssignees.length);
      const rejectRequiredCount = Math.max(1, Math.max(1, stepAssignees.length) - requiredCount + 1);

      if (effectiveRejectedCount < rejectRequiredCount) {
        const stepNote = `مخالفت در مرحله «${currentStep?.title || `گام ${project.currentStepOrder}`}» ثبت شد (${effectiveRejectedCount} از ${rejectRequiredCount} رای مخالف لازم)${comment ? ` — ${comment}` : ''}`;
        db.prepare(`
          INSERT INTO workflow_logs (id, projectId, stepOrder, fromUserId, toPositionId, action, comment, createdAt)
          VALUES (?, ?, ?, ?, ?, 'STEP_REJECTED', ?, ?)
        `).run(
          logId,
          projectId,
          project.currentStepOrder || 1,
          currentUser.id,
          currentPosIds[0] || project.currentPositionId || null,
          stepNote,
          now
        );

        db.prepare('UPDATE projects SET updatedAt = ? WHERE id = ?').run(now, projectId);

        return res.json({
          success: true,
          advanced: false,
          approvedCount: matchedApproveCount,
          rejectedCount: effectiveRejectedCount,
          requiredCount,
          rejectRequiredCount,
          totalAssignees: stepAssignees.length,
          currentStepOrder: project.currentStepOrder || 1,
          currentPositionId: project.currentPositionId,
          status: project.status,
        });
      }
    }

    db.prepare('DELETE FROM workflow_step_approvals WHERE projectId = ?').run(projectId);
    newStatus = 'REJECTED';
  }

  const loggedAction =
    (action === 'FORWARD' || action === 'APPROVED') && newStatus === 'APPROVED'
      ? 'FINAL_APPROVED'
      : action;

  db.prepare(`
    INSERT INTO workflow_logs (id, projectId, stepOrder, fromUserId, toPositionId, action, comment, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    logId,
    projectId,
    project.currentStepOrder || 1,
    currentUser.id,
    targetPositionId,
    loggedAction,
    comment || '',
    now
  );

  db.prepare(`
    UPDATE projects
    SET currentStepOrder = ?, currentPositionId = ?, status = ?, updatedAt = ?
    WHERE id = ?
  `).run(targetStepOrder, targetPositionId, newStatus, now, projectId);

  // Send group notification to chat
  const actionText = loggedAction === 'FINAL_APPROVED' ? 'تصویب نهایی و اتمام گردش کار' : action === 'FORWARD' ? 'تایید و ارجاع به مرحله بعد' : action === 'NEEDS_REVISION' ? 'درخواست اصلاح و ارجاع به گام قبل' : action === 'REJECTED' ? 'رد طرح در گردش کار' : 'تایید نهایی';
  db.prepare(`
    INSERT INTO messages (id, senderId, receiverId, isGroup, content, projectId, createdAt)
    VALUES (?, ?, NULL, 1, ?, ?, ?)
  `).run(
    `msg-${randomUUID().substring(0, 8)}`,
    currentUser.id,
    `گردش کار پروژه «${project.title}»: ${currentUser.name} (${currentUser.positionTitle || 'عضو شورا'}) اقدام «${actionText}» را ثبت کرد.${comment ? ` توضیح: ${comment}` : ''}`,
    projectId,
    now
  );

  res.json({
    success: true,
    advanced: true,
    currentStepOrder: targetStepOrder,
    currentPositionId: targetPositionId,
    status: newStatus,
  });
});

apiRouter.get('/projects/:id/workflow-logs', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'کاربر احراز هویت نشده است.' });
  }
  const { id } = req.params;
  const rawLogs = db.prepare(`
    SELECT l.*, u.name as fromUserName, u.username as fromUsername, pos.title as toPositionTitle, uPos.title as fromUserPosition
    FROM workflow_logs l
    JOIN users u ON l.fromUserId = u.id
    LEFT JOIN positions uPos ON u.positionId = uPos.id
    LEFT JOIN positions pos ON l.toPositionId = pos.id
    WHERE l.projectId = ?
    ORDER BY l.createdAt ASC
  `).all(id) as any[];

  res.json({ logs: sanitizeWorkflowLogsForViewer(rawLogs, currentUser) });
});

// --------------------------------------------------------------------------
// 4.5. PROJECT STRUCTURES & TYPES (تعریف انواع و ساختارهای پویا و غیر استاتیک پروژه)
// --------------------------------------------------------------------------

apiRouter.get('/project-structures', (_req: Request, res: Response) => {
  const structures = db.prepare(`
    SELECT ps.*, w.title as defaultWorkflowTitle,
           (SELECT COUNT(*) FROM projects p WHERE p.productionType = ps.title) as projectCount,
           (SELECT COUNT(*) FROM structure_positions sp WHERE sp.structureId = ps.id) as positionCount,
           (SELECT COUNT(DISTINCT spu.userId) FROM structure_positions sp JOIN structure_position_users spu ON sp.id = spu.structurePositionId WHERE sp.structureId = ps.id) as userCount
    FROM project_structures ps
    LEFT JOIN workflows w ON ps.defaultWorkflowId = w.id
    ORDER BY ps.orderIndex ASC, ps.title ASC
  `).all();
  res.json({ structures });
});

apiRouter.post('/project-structures', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'structures.create')) {
    return res.status(403).json({ error: 'شما مجاز به تعریف ساختار سازمانی جدید نیستید.' });
  }

  const { title, code, description, category, defaultWorkflowId, orderIndex, isActive } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'عنوان ساختار سازمانی الزامی است.' });
  }

  const id = `pstr-${randomUUID().substring(0, 8)}`;
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO project_structures (id, title, code, description, category, defaultWorkflowId, orderIndex, isActive, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      title.trim(),
      code ? code.trim() : null,
      description || '',
      category || 'امور اداری و سازمانی',
      defaultWorkflowId || null,
      orderIndex || 0,
      isActive !== undefined ? (isActive ? 1 : 0) : 1,
      now
    );

    const created = db.prepare(`
      SELECT ps.*, w.title as defaultWorkflowTitle, 0 as projectCount, 0 as positionCount, 0 as userCount
      FROM project_structures ps
      LEFT JOIN workflows w ON ps.defaultWorkflowId = w.id
      WHERE ps.id = ?
    `).get(id);

    res.json({ success: true, structure: created });
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'این ساختار سازمانی قبلاً ثبت شده است.' });
    }
    res.status(500).json({ error: 'خطا در ثبت ساختار سازمانی جدید.' });
  }
});

apiRouter.put('/project-structures/:id', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'structures.edit')) {
    return res.status(403).json({ error: 'شما مجاز به ویرایش این ساختار سازمانی نیستید.' });
  }

  const { id } = req.params;
  const { title, code, description, category, defaultWorkflowId, orderIndex, isActive } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'عنوان ساختار الزامی است.' });
  }

  const current = db.prepare('SELECT title FROM project_structures WHERE id = ?').get(id) as any;
  if (!current) {
    return res.status(404).json({ error: 'ساختار مورد نظر یافت نشد.' });
  }

  try {
    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE project_structures
        SET title = ?, code = ?, description = ?, category = ?, defaultWorkflowId = ?, orderIndex = ?, isActive = ?
        WHERE id = ?
      `).run(
        title.trim(),
        code ? code.trim() : null,
        description || '',
        category || 'تولید تلویزیونی',
        defaultWorkflowId || null,
        orderIndex !== undefined ? orderIndex : 0,
        isActive !== undefined ? (isActive ? 1 : 0) : 1,
        id
      );

      // If title changed, sync projects with previous title
      if (current.title !== title.trim()) {
        db.prepare('UPDATE projects SET productionType = ? WHERE productionType = ?').run(title.trim(), current.title);
      }
    });
    tx();

    const updated = db.prepare(`
      SELECT ps.*, w.title as defaultWorkflowTitle,
             (SELECT COUNT(*) FROM projects p WHERE p.productionType = ps.title) as projectCount,
             (SELECT COUNT(*) FROM structure_positions sp WHERE sp.structureId = ps.id) as positionCount,
             (SELECT COUNT(DISTINCT spu.userId) FROM structure_positions sp JOIN structure_position_users spu ON sp.id = spu.structurePositionId WHERE sp.structureId = ps.id) as userCount
      FROM project_structures ps
      LEFT JOIN workflows w ON ps.defaultWorkflowId = w.id
      WHERE ps.id = ?
    `).get(id);

    res.json({ success: true, structure: updated });
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'این عنوان ساختار تکراری است.' });
    }
    res.status(500).json({ error: 'خطا در ویرایش ساختار سازمانی.' });
  }
});

apiRouter.delete('/project-structures/:id', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'structures.delete')) {
    return res.status(403).json({ error: 'شما مجاز به حذف این ساختار سازمانی نیستید.' });
  }

  const { id } = req.params;
  const current = db.prepare('SELECT title FROM project_structures WHERE id = ?').get(id) as any;
  if (!current) {
    return res.status(404).json({ error: 'ساختار یافت نشد.' });
  }

  const count = (db.prepare('SELECT COUNT(*) as c FROM projects WHERE productionType = ?').get(current.title) as any)?.c || 0;
  if (count > 0) {
    return res.status(400).json({ error: `این ساختار در ${count} پروژه ثبت شده استفاده شده است و امکان حذف مستقیم ندارد. می‌توانید آن را غیرفعال کنید.` });
  }

  db.prepare('DELETE FROM project_structures WHERE id = ?').run(id);
  res.json({ success: true });
});

// --------------------------------------------------------------------------
// 4.6. STRUCTURE POSITIONS & TREE (درخت سمت‌ها و انتصاب پرسنل و دسترسی‌ها در ساختار)
// --------------------------------------------------------------------------

// Get hierarchical positions tree for a specific structure
apiRouter.get('/project-structures/:id/positions', (req: Request, res: Response) => {
  const { id: structureId } = req.params;
  const structure = db.prepare('SELECT * FROM project_structures WHERE id = ?').get(structureId) as any;
  if (!structure) {
    return res.status(404).json({ error: 'ساختار مورد نظر یافت نشد.' });
  }

  // Get all structure positions with underlying position details
  const rawNodes = db.prepare(`
    SELECT sp.id, sp.structureId, sp.positionId, sp.parentId, sp.orderIndex, sp.createdAt,
           p.title, p.description, p.color,
           parentP.title as parentTitle
    FROM structure_positions sp
    JOIN positions p ON sp.positionId = p.id
    LEFT JOIN structure_positions parentSp ON sp.parentId = parentSp.id
    LEFT JOIN positions parentP ON parentSp.positionId = parentP.id
    WHERE sp.structureId = ?
    ORDER BY sp.orderIndex ASC, sp.createdAt ASC
  `).all(structureId) as any[];

  // Get all assigned users per structure_position
  const assignedUsersRaw = db.prepare(`
    SELECT spu.structurePositionId, u.id, u.username, u.name, u.role, u.positionId, u.avatar, u.phone
    FROM structure_position_users spu
    JOIN users u ON spu.userId = u.id
    WHERE spu.structurePositionId IN (SELECT id FROM structure_positions WHERE structureId = ?)
  `).all(structureId) as any[];

  // Get position permissions
  const posPermsRaw = db.prepare(`
    SELECT pp.positionId, pp.permissionCode
    FROM position_permissions pp
    WHERE pp.positionId IN (SELECT positionId FROM structure_positions WHERE structureId = ?)
  `).all(structureId) as any[];

  // Enrich nodes
  const nodes = rawNodes.map((n) => {
    const nodeUsers = assignedUsersRaw
      .filter((u) => u.structurePositionId === n.id)
      .map((u) => ({
        ...u,
        permissions: getUserPermissionsList(u),
      }));

    const permissions = posPermsRaw
      .filter((p) => p.positionId === n.positionId)
      .map((p) => p.permissionCode);

    return {
      ...n,
      users: nodeUsers,
      permissions,
    };
  });

  // Build recursive tree
  const buildTree = (parentId: string | null = null, depth = 1): any[] => {
    return nodes
      .filter((n) => (parentId === null ? !n.parentId : n.parentId === parentId))
      .map((n) => ({
        ...n,
        level: depth,
        children: buildTree(n.id, depth + 1),
      }));
  };

  const tree = buildTree(null, 1);

  res.json({
    structure,
    positions: nodes,
    tree,
  });
});

// Add a position to a structure's tree (reusing existing position or creating new)
apiRouter.post('/project-structures/:id/positions', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, ['structures.create', 'structures.edit', 'org.positions.create'])) {
    return res.status(403).json({ error: 'شما مجاز به تعریف و چینش سمت در ساختار نیستید.' });
  }

  const { id: structureId } = req.params;
  const { positionId, title, description, color, parentId, userIds } = req.body;

  let resolvedPositionId = positionId;

  // If no positionId, create position in positions library first
  if (!resolvedPositionId) {
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'عنوان سمت الزامی است.' });
    }

    // Check if position already exists by title
    const existing = db.prepare('SELECT id FROM positions WHERE title = ?').get(title.trim()) as any;
    if (existing) {
      resolvedPositionId = existing.id;
    } else {
      resolvedPositionId = `pos-${randomUUID().substring(0, 8)}`;
      db.prepare(`
        INSERT INTO positions (id, title, description, color, parentId, level, orderIndex, createdAt)
        VALUES (?, ?, ?, ?, NULL, 1, 0, ?)
      `).run(resolvedPositionId, title.trim(), description || '', color || 'indigo', new Date().toISOString());
    }
  }

  // Prevent duplicate same position in same structure directly
  const duplicate = db.prepare('SELECT id FROM structure_positions WHERE structureId = ? AND positionId = ?').get(structureId, resolvedPositionId) as any;
  if (duplicate) {
    return res.status(400).json({ error: 'این سمت در حال حاضر در درخت این ساختار تعریف شده است.' });
  }

  const spId = `sp-${randomUUID().substring(0, 8)}`;
  const now = new Date().toISOString();

  const maxOrder = (db.prepare('SELECT MAX(orderIndex) as mo FROM structure_positions WHERE structureId = ?').get(structureId) as any)?.mo || 0;

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO structure_positions (id, structureId, positionId, parentId, orderIndex, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(spId, structureId, resolvedPositionId, parentId || null, maxOrder + 1, now);

    // If initial users assigned
    if (Array.isArray(userIds) && userIds.length > 0) {
      const insertSPU = db.prepare('INSERT OR IGNORE INTO structure_position_users (structurePositionId, userId) VALUES (?, ?)');
      for (const uId of userIds) {
        insertSPU.run(spId, uId);
      }
    }
  });

  tx();

  res.json({ success: true, structurePositionId: spId });
});

// Helper to detect ancestor cycle in parent-child node lists
function hasParentCycle(items: Array<{ id: string; parentId?: string | null }>, nodeId: string, candidateParentId: string | null): boolean {
  if (!candidateParentId) return false;
  if (candidateParentId === nodeId) return true;
  const parentMap = new Map<string, string | null>();
  items.forEach((it) => parentMap.set(it.id, it.parentId || null));
  let cur: string | null = candidateParentId;
  const visited = new Set<string>([nodeId]);
  while (cur) {
    if (visited.has(cur)) return true;
    visited.add(cur);
    cur = parentMap.get(cur) || null;
  }
  return false;
}

// Batch reorder / re-parent structure positions (drag & drop)
apiRouter.put('/project-structures/:id/positions-reorder', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, ['structures.edit', 'org.positions.edit'])) {
    return res.status(403).json({ error: 'شما مجاز به تغییر چینش ساختار نیستید.' });
  }

  const { id: structureId } = req.params;
  const { items } = req.body as { items: Array<{ id: string; parentId: string | null; orderIndex: number }> };
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'لیست چینش سمت‌ها معتبر نیست.' });
  }

  const existing = db.prepare('SELECT id, parentId FROM structure_positions WHERE structureId = ?').all(structureId) as Array<{ id: string; parentId: string | null }>;
  const existingIds = new Set(existing.map((e) => e.id));

  // Merge proposed updates to validate cycle safety across full tree
  const merged = existing.map((e) => {
    const upd = items.find((i) => i.id === e.id);
    return { id: e.id, parentId: upd ? (upd.parentId || null) : e.parentId };
  });

  for (const item of items) {
    if (!existingIds.has(item.id)) continue;
    if (item.parentId && !existingIds.has(item.parentId)) {
      return res.status(400).json({ error: 'سمت والد انتخاب شده در این ساختار وجود ندارد.' });
    }
    if (hasParentCycle(merged, item.id, item.parentId || null)) {
      return res.status(400).json({ error: 'انتقال نامعتبر: یک سمت نمی‌تواند زیرمجموعه زیرشاخه‌های خودش قرار گیرد.' });
    }
  }

  const updateStmt = db.prepare('UPDATE structure_positions SET parentId = ?, orderIndex = ? WHERE id = ? AND structureId = ?');
  const tx = db.transaction(() => {
    for (const item of items) {
      updateStmt.run(item.parentId || null, item.orderIndex ?? 0, item.id, structureId);
    }
  });
  tx();

  res.json({ success: true });
});

// Update a position node in a structure (change parent, update position details)
apiRouter.put('/project-structures/:id/positions/:spId', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, ['structures.edit', 'org.positions.edit'])) {
    return res.status(403).json({ error: 'شما مجاز به ویرایش سمت در ساختار نیستید.' });
  }

  const { id: structureId, spId } = req.params;
  const { parentId, orderIndex, title, description, color } = req.body;

  const currentSP = db.prepare('SELECT * FROM structure_positions WHERE id = ? AND structureId = ?').get(spId, structureId) as any;
  if (!currentSP) {
    return res.status(404).json({ error: 'گره سمت در این ساختار یافت نشد.' });
  }

  if (parentId !== undefined && parentId !== null) {
    const allNodes = db.prepare('SELECT id, parentId FROM structure_positions WHERE structureId = ?').all(structureId) as Array<{ id: string; parentId: string | null }>;
    if (hasParentCycle(allNodes, spId, parentId)) {
      return res.status(400).json({ error: 'یک سمت نمی‌تواند والد خودش یا زیرمجموعه زیرشاخه‌هایش باشد.' });
    }
  }

  const tx = db.transaction(() => {
    // Update node links
    db.prepare(`
      UPDATE structure_positions
      SET parentId = ?, orderIndex = ?
      WHERE id = ?
    `).run(
      parentId !== undefined ? (parentId || null) : currentSP.parentId,
      orderIndex !== undefined ? orderIndex : currentSP.orderIndex,
      spId
    );

    // If title or details updated, update underlying position
    if (title && title.trim()) {
      db.prepare(`
        UPDATE positions
        SET title = ?, description = ?, color = ?
        WHERE id = ?
      `).run(title.trim(), description || '', color || 'indigo', currentSP.positionId);
    }
  });

  tx();

  res.json({ success: true });
});

// Delete position from structure's tree
apiRouter.delete('/project-structures/:id/positions/:spId', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, ['structures.delete', 'org.positions.delete'])) {
    return res.status(403).json({ error: 'شما مجاز به حذف سمت از این ساختار نیستید.' });
  }

  const { id: structureId, spId } = req.params;
  const currentSP = db.prepare('SELECT * FROM structure_positions WHERE id = ? AND structureId = ?').get(spId, structureId) as any;
  if (!currentSP) {
    return res.status(404).json({ error: 'گره سمت در این ساختار یافت نشد.' });
  }

  const tx = db.transaction(() => {
    // Re-parent children to current parent to preserve tree integrity
    db.prepare('UPDATE structure_positions SET parentId = ? WHERE parentId = ?').run(currentSP.parentId, spId);
    // Delete user assignments
    db.prepare('DELETE FROM structure_position_users WHERE structurePositionId = ?').run(spId);
    // Delete node
    db.prepare('DELETE FROM structure_positions WHERE id = ?').run(spId);
  });

  tx();

  res.json({ success: true });
});

// Assign user to a structure position
apiRouter.post('/project-structures/:id/positions/:spId/users', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, ['structures.edit', 'org.positions.assign'])) {
    return res.status(403).json({ error: 'شما مجاز به انتصاب کاربر به این سمت نیستید.' });
  }

  const { id: structureId, spId } = req.params;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'شناسه کاربر الزامی است.' });
  }

  const sp = db.prepare('SELECT id FROM structure_positions WHERE id = ? AND structureId = ?').get(spId, structureId);
  if (!sp) {
    return res.status(404).json({ error: 'سمت در این ساختار یافت نشد.' });
  }

  const user = db.prepare('SELECT id, name FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'کاربر یافت نشد.' });
  }

  db.prepare(`
    INSERT OR IGNORE INTO structure_position_users (structurePositionId, userId)
    VALUES (?, ?)
  `).run(spId, userId);

  res.json({ success: true });
});

// Remove user from a structure position
apiRouter.delete('/project-structures/:id/positions/:spId/users/:userId', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, ['structures.edit', 'org.positions.assign'])) {
    return res.status(403).json({ error: 'شما مجاز به لغو انتصاب کاربر از این سمت نیستید.' });
  }

  const { spId, userId } = req.params;

  db.prepare('DELETE FROM structure_position_users WHERE structurePositionId = ? AND userId = ?').run(spId, userId);

  res.json({ success: true });
});

// --------------------------------------------------------------------------
// 5. DYNAMIC FIELDS (تعریف پویای فیلدها با کنترل سطح دسترسی)
// --------------------------------------------------------------------------

apiRouter.get('/dynamic-fields', (_req: Request, res: Response) => {
  const fields = db.prepare(`
    SELECT df.*, parentDf.name as parentName
    FROM dynamic_fields df
    LEFT JOIN dynamic_fields parentDf ON df.parentId = parentDf.id
    WHERE df.isActive = 1
    ORDER BY df.orderIndex ASC, df.name ASC
  `).all();
  res.json({ fields });
});

apiRouter.post('/dynamic-fields', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'projects.fields.create')) {
    return res.status(403).json({
      error: 'عدم دسترسی: شما مجوز ثبت فیلد یا ویژگی پویای جدید را ندارید.',
    });
  }

  const { name, key, fieldType, unit, defaultValue, optionsJson, required, category, icon, parentId, orderIndex } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'نام فیلد الزامی است.' });
  }

  if (parentId) {
    const parentExists = db.prepare('SELECT id FROM dynamic_fields WHERE id = ? AND isActive = 1').get(parentId);
    if (!parentExists) {
      return res.status(400).json({ error: 'فیلد والد انتخاب‌شده یافت نشد.' });
    }
  }

  const safeKey = (key && key.trim())
    ? key.trim().toLowerCase().replace(/\s+/g, '_')
    : `field_${Date.now()}`;

  const id = `fld-${randomUUID().substring(0, 8)}`;
  const maxOrder = db.prepare('SELECT MAX(orderIndex) as maxO FROM dynamic_fields').get() as any;
  const nextOrder = orderIndex !== undefined ? orderIndex : ((maxOrder?.maxO || 0) + 1);

  try {
    db.prepare(`
      INSERT INTO dynamic_fields (id, name, key, fieldType, unit, defaultValue, optionsJson, required, orderIndex, isActive, icon, category, parentId, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).run(
      id,
      name.trim(),
      safeKey,
      fieldType || 'number',
      unit !== undefined ? unit : (fieldType === 'currency' ? 'تومان' : fieldType === 'text' || fieldType === 'select' ? '' : 'نفر'),
      defaultValue !== undefined ? String(defaultValue) : (fieldType === 'text' || fieldType === 'select' ? '' : '1'),
      optionsJson || '[]',
      required ? 1 : 0,
      nextOrder,
      icon || 'Users',
      category || 'عوامل تولید',
      parentId || null,
      new Date().toISOString()
    );

    const created = db.prepare(`
      SELECT df.*, parentDf.name as parentName
      FROM dynamic_fields df
      LEFT JOIN dynamic_fields parentDf ON df.parentId = parentDf.id
      WHERE df.id = ?
    `).get(id);
    res.json({ success: true, field: created });
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'کلید شناسایی فیلد تکراری است.' });
    }
    res.status(500).json({ error: 'خطا در ثبت فیلد پویای پروژه.' });
  }
});

// MUST be registered before /dynamic-fields/:id
apiRouter.put('/dynamic-fields/reorder', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'projects.fields.edit')) {
    return res.status(403).json({ error: 'عدم دسترسی: شما مجاز به تغییر ترتیب و ساختار فیلدهای پروژه نیستید.' });
  }

  const { items } = req.body as { items: Array<{ id: string; parentId: string | null; orderIndex: number }> };
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'داده‌های چینش فیلدها نامعتبر است.' });
  }

  const allFields = db.prepare('SELECT id, parentId FROM dynamic_fields WHERE isActive = 1').all() as Array<{ id: string; parentId: string | null }>;
  const existingIds = new Set(allFields.map((f) => f.id));

  const merged = allFields.map((f) => {
    const upd = items.find((i) => i.id === f.id);
    return { id: f.id, parentId: upd ? (upd.parentId || null) : f.parentId };
  });

  for (const item of items) {
    if (!existingIds.has(item.id)) continue;
    if (item.parentId && !existingIds.has(item.parentId)) {
      return res.status(400).json({ error: 'فیلد والد انتخاب‌شده وجود ندارد.' });
    }
    if (hasParentCycle(merged, item.id, item.parentId || null)) {
      return res.status(400).json({ error: 'انتقال نامعتبر: یک فیلد نمی‌تواند زیرمجموعه خودش یا زیرشاخه‌هایش باشد.' });
    }
  }

  const stmt = db.prepare('UPDATE dynamic_fields SET parentId = ?, orderIndex = ? WHERE id = ?');
  const tx = db.transaction(() => {
    for (const item of items) {
      stmt.run(item.parentId || null, item.orderIndex ?? 0, item.id);
    }
  });
  tx();

  res.json({ success: true });
});

apiRouter.put('/dynamic-fields/:id', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'projects.fields.edit')) {
    return res.status(403).json({ error: 'عدم دسترسی: شما مجاز به ویرایش فیلدهای پروژه نیستید.' });
  }

  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM dynamic_fields WHERE id = ?').get(id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'فیلد مورد نظر یافت نشد.' });
  }

  const { name, fieldType, unit, defaultValue, optionsJson, required, category, icon, parentId, orderIndex } = req.body;
  if (name !== undefined && !String(name).trim()) {
    return res.status(400).json({ error: 'نام فیلد نمی‌تواند خالی باشد.' });
  }

  if (parentId !== undefined && parentId !== null) {
    const allFields = db.prepare('SELECT id, parentId FROM dynamic_fields WHERE isActive = 1').all() as Array<{ id: string; parentId: string | null }>;
    if (hasParentCycle(allFields, id, parentId)) {
      return res.status(400).json({ error: 'فیلد نمی‌تواند والد خودش یا زیرمجموعه زیرشاخه‌هایش باشد.' });
    }
  }

  db.prepare(`
    UPDATE dynamic_fields
    SET name = ?, fieldType = ?, unit = ?, defaultValue = ?, optionsJson = ?, required = ?, category = ?, icon = ?, parentId = ?, orderIndex = ?
    WHERE id = ?
  `).run(
    name !== undefined ? String(name).trim() : existing.name,
    fieldType !== undefined ? fieldType : existing.fieldType,
    unit !== undefined ? unit : existing.unit,
    defaultValue !== undefined ? String(defaultValue) : existing.defaultValue,
    optionsJson !== undefined ? optionsJson : existing.optionsJson,
    required !== undefined ? (required ? 1 : 0) : existing.required,
    category !== undefined ? category : existing.category,
    icon !== undefined ? icon : existing.icon,
    parentId !== undefined ? (parentId || null) : existing.parentId,
    orderIndex !== undefined ? orderIndex : existing.orderIndex,
    id
  );

  const updated = db.prepare(`
    SELECT df.*, parentDf.name as parentName
    FROM dynamic_fields df
    LEFT JOIN dynamic_fields parentDf ON df.parentId = parentDf.id
    WHERE df.id = ?
  `).get(id);

  res.json({ success: true, field: updated });
});

apiRouter.delete('/dynamic-fields/:id', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'projects.fields.delete')) {
    return res.status(403).json({ error: 'عدم دسترسی: شما مجاز به حذف فیلدهای پروژه نیستید.' });
  }
  const { id } = req.params;
  const current = db.prepare('SELECT parentId FROM dynamic_fields WHERE id = ?').get(id) as any;
  const tx = db.transaction(() => {
    if (current) {
      db.prepare('UPDATE dynamic_fields SET parentId = ? WHERE parentId = ?').run(current.parentId || null, id);
    }
    db.prepare('DELETE FROM dynamic_fields WHERE id = ?').run(id);
  });
  tx();
  res.json({ success: true });
});

// --------------------------------------------------------------------------
// 5.5. PROJECT TYPES & LINKED DYNAMIC FIELDS (انواع پروژه و اتصال فیلدها)
// --------------------------------------------------------------------------

function getProjectTypeWithFields(typeRow: any, allLinks: Array<{ projectTypeId: string; fieldId: string }>) {
  const fieldIds = allLinks
    .filter((l) => l.projectTypeId === typeRow.id)
    .map((l) => l.fieldId);
  return {
    ...typeRow,
    fieldIds,
    fieldCount: fieldIds.length,
  };
}

apiRouter.get('/project-types', (_req: Request, res: Response) => {
  const rows = db.prepare(`
    SELECT pt.*, w.title as defaultWorkflowTitle,
           (SELECT COUNT(*) FROM projects p WHERE p.projectTypeId = pt.id) as projectCount
    FROM project_types pt
    LEFT JOIN workflows w ON pt.defaultWorkflowId = w.id
    ORDER BY pt.orderIndex ASC, pt.title ASC
  `).all() as any[];

  const links = db.prepare(`
    SELECT ptf.projectTypeId, ptf.fieldId
    FROM project_type_fields ptf
    JOIN dynamic_fields df ON ptf.fieldId = df.id
    WHERE df.isActive = 1
    ORDER BY ptf.orderIndex ASC
  `).all() as Array<{ projectTypeId: string; fieldId: string }>;

  const projectTypes = rows.map((r) => getProjectTypeWithFields(r, links));
  res.json({ projectTypes });
});

apiRouter.post('/project-types', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'projects.fields.create')) {
    return res.status(403).json({ error: 'عدم دسترسی: شما مجوز تعریف نوع پروژه جدید را ندارید.' });
  }

  const { title, description, defaultWorkflowId, isActive, fieldIds } = req.body;
  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: 'عنوان نوع پروژه الزامی است.' });
  }

  const cleanFieldIds = Array.isArray(fieldIds)
    ? Array.from(new Set(fieldIds.filter((id: any) => typeof id === 'string' && id.trim())))
    : [];

  const id = `ptype-${randomUUID().substring(0, 8)}`;
  const now = new Date().toISOString();
  const maxOrder = (db.prepare('SELECT MAX(orderIndex) as maxO FROM project_types').get() as any)?.maxO || 0;

  try {
    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO project_types (id, title, description, defaultWorkflowId, orderIndex, isActive, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        String(title).trim(),
        description ? String(description).trim() : '',
        defaultWorkflowId || null,
        maxOrder + 1,
        isActive === false || isActive === 0 ? 0 : 1,
        now
      );

      const insertLink = db.prepare(`
        INSERT OR IGNORE INTO project_type_fields (projectTypeId, fieldId, orderIndex)
        VALUES (?, ?, ?)
      `);
      cleanFieldIds.forEach((fid, idx) => {
        insertLink.run(id, fid, idx);
      });
    });
    tx();

    const createdRow = db.prepare(`
      SELECT pt.*, w.title as defaultWorkflowTitle, 0 as projectCount
      FROM project_types pt
      LEFT JOIN workflows w ON pt.defaultWorkflowId = w.id
      WHERE pt.id = ?
    `).get(id) as any;

    res.json({
      success: true,
      projectType: {
        ...createdRow,
        fieldIds: cleanFieldIds,
        fieldCount: cleanFieldIds.length,
      },
    });
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'این عنوان نوع پروژه قبلاً ثبت شده است.' });
    }
    res.status(500).json({ error: 'خطا در ثبت نوع پروژه.' });
  }
});

apiRouter.put('/project-types/:id', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'projects.fields.edit')) {
    return res.status(403).json({ error: 'عدم دسترسی: شما مجوز ویرایش نوع پروژه را ندارید.' });
  }

  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM project_types WHERE id = ?').get(id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'نوع پروژه یافت نشد.' });
  }

  const { title, description, defaultWorkflowId, isActive, fieldIds } = req.body;
  if (title !== undefined && !String(title).trim()) {
    return res.status(400).json({ error: 'عنوان نوع پروژه نمی‌تواند خالی باشد.' });
  }

  try {
    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE project_types
        SET title = ?, description = ?, defaultWorkflowId = ?, isActive = ?
        WHERE id = ?
      `).run(
        title !== undefined ? String(title).trim() : existing.title,
        description !== undefined ? String(description).trim() : existing.description,
        defaultWorkflowId !== undefined ? (defaultWorkflowId || null) : existing.defaultWorkflowId,
        isActive !== undefined ? (isActive === false || isActive === 0 ? 0 : 1) : existing.isActive,
        id
      );

      if (Array.isArray(fieldIds)) {
        const cleanFieldIds = Array.from(
          new Set(fieldIds.filter((fid: any) => typeof fid === 'string' && fid.trim()))
        );
        db.prepare('DELETE FROM project_type_fields WHERE projectTypeId = ?').run(id);
        const insertLink = db.prepare(`
          INSERT OR IGNORE INTO project_type_fields (projectTypeId, fieldId, orderIndex)
          VALUES (?, ?, ?)
        `);
        cleanFieldIds.forEach((fid, idx) => {
          insertLink.run(id, fid, idx);
        });
      }
    });
    tx();

    const updatedRow = db.prepare(`
      SELECT pt.*, w.title as defaultWorkflowTitle,
             (SELECT COUNT(*) FROM projects p WHERE p.projectTypeId = pt.id) as projectCount
      FROM project_types pt
      LEFT JOIN workflows w ON pt.defaultWorkflowId = w.id
      WHERE pt.id = ?
    `).get(id) as any;

    const links = db.prepare(`
      SELECT projectTypeId, fieldId
      FROM project_type_fields
      WHERE projectTypeId = ?
      ORDER BY orderIndex ASC
    `).all(id) as Array<{ projectTypeId: string; fieldId: string }>;

    res.json({
      success: true,
      projectType: getProjectTypeWithFields(updatedRow, links),
    });
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'این عنوان نوع پروژه قبلاً ثبت شده است.' });
    }
    res.status(500).json({ error: 'خطا در ویرایش نوع پروژه.' });
  }
});

apiRouter.delete('/project-types/:id', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'projects.fields.delete')) {
    return res.status(403).json({ error: 'عدم دسترسی: شما مجاز به حذف نوع پروژه نیستید.' });
  }

  const { id } = req.params;
  const tx = db.transaction(() => {
    db.prepare('UPDATE projects SET projectTypeId = NULL WHERE projectTypeId = ?').run(id);
    db.prepare('DELETE FROM project_type_fields WHERE projectTypeId = ?').run(id);
    db.prepare('DELETE FROM project_types WHERE id = ?').run(id);
  });
  tx();
  res.json({ success: true });
});

// --------------------------------------------------------------------------
// 6. PROJECTS & CARTABLE (پروژه‌ها و کارتابل با پشتیبانی از گردش کار و محرمانگی)
// --------------------------------------------------------------------------

apiRouter.get('/projects', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'احراز هویت نشده است.' });
  }

  const canViewAllProjects = hasPermission(currentUser, 'projects.view');

  const projects = db.prepare(`
    SELECT p.*, u.name as creatorName, w.title as workflowTitle,
           pos.title as currentPositionTitle, pos.color as currentPositionColor,
           COALESCE(pt.title, p.productionType) as projectTypeTitle
    FROM projects p
    LEFT JOIN users u ON p.createdById = u.id
    LEFT JOIN workflows w ON p.workflowId = w.id
    LEFT JOIN positions pos ON p.currentPositionId = pos.id
    LEFT JOIN project_types pt ON p.projectTypeId = pt.id
    ORDER BY p.createdAt DESC
  `).all() as any[];

  const totalCouncilCount = (db.prepare("SELECT count(*) as count FROM users WHERE role = 'COUNCIL'").get() as any)?.count || 0;

  // Pre-fetch all attachments without heavy base64 data
  const allAttachments = db.prepare(`
    SELECT a.id, a.projectId, a.fileName, a.fileSize, a.fileType, a.uploadedBy, a.createdAt,
           u.name as uploaderName
    FROM project_attachments a
    LEFT JOIN users u ON a.uploadedBy = u.id
    ORDER BY a.createdAt DESC
  `).all() as any[];

  // Pre-fetch workflow steps, approvals, and logs
  const allStepsRaw = db.prepare(`
    SELECT s.*, p.title as positionTitle, p.color as positionColor, ps.title as structureTitle
    FROM workflow_steps s
    LEFT JOIN positions p ON s.positionId = p.id
    LEFT JOIN project_structures ps ON s.structureId = ps.id
    ORDER BY s.stepOrder ASC
  `).all() as any[];

  const allStepApprovals = db.prepare(`
    SELECT projectId, stepOrder, userId FROM workflow_step_approvals
  `).all() as Array<{ projectId: string; stepOrder: number; userId: string }>;

  const posMap = getPositionsLookupMap();
  const allSteps = allStepsRaw.map((s) => enrichStepObject(s, posMap));

  const allLogsRaw = db.prepare(`
    SELECT l.*, u.name as fromUserName, u.username as fromUsername, pos.title as toPositionTitle, uPos.title as fromUserPosition
    FROM workflow_logs l
    JOIN users u ON l.fromUserId = u.id
    LEFT JOIN positions uPos ON u.positionId = uPos.id
    LEFT JOIN positions pos ON l.toPositionId = pos.id
    ORDER BY l.createdAt ASC
  `).all() as any[];
  const allLogs = sanitizeWorkflowLogsForViewer(allLogsRaw, currentUser);

  const canViewConfidential = hasPermission(currentUser, 'voting.confidential.view_all');

  // Pre-fetch users & structure assignments so multi-position steps and member counts resolve consistently
  const allUsers = db.prepare(`
    SELECT u.id, u.username, u.name, u.role, u.positionId, u.avatar, u.phone,
           p.title as positionTitle, p.color as positionColor
    FROM users u
    LEFT JOIN positions p ON u.positionId = p.id
  `).all() as any[];

  const allStructAssignments = db.prepare(`
    SELECT spu.userId, sp.positionId, sp.structureId, ps.title as structureTitle
    FROM structure_position_users spu
    JOIN structure_positions sp ON spu.structurePositionId = sp.id
    LEFT JOIN project_structures ps ON sp.structureId = ps.id
  `).all() as Array<{ userId: string; positionId: string; structureId: string; structureTitle?: string }>;

  const userStructureAssignments = allStructAssignments.filter((sa) => sa.userId === currentUser.id);
  const WORKFLOW_PARTICIPATION_ACTIONS = new Set([
    'FORWARD',
    'STEP_APPROVED',
    'STEP_REJECTED',
    'APPROVED',
    'FINAL_APPROVED',
    'MANUAL_APPROVED',
    'NEEDS_REVISION',
    'REJECTED',
  ]);

  const result = projects.map((prj) => {
    let requirements = {};
    try {
      requirements = JSON.parse(prj.requirementsJson || '{}');
    } catch (e) {
      requirements = {};
    }

    const majorityInfo = calculateMajorityForProject(prj.id);
    const prjSteps = prj.workflowId ? allSteps.filter((s) => s.workflowId === prj.workflowId) : [];
    const hasWorkflow = Boolean(prj.workflowId && prjSteps.length > 0);
    const prjLogs = allLogs.filter((l) => l.projectId === prj.id);
    const prjAttachments = allAttachments.filter((a) => a.projectId === prj.id);

    const isCompletedOrRejected = prj.status === 'APPROVED' || prj.status === 'REJECTED';
    const currentStepObj = prjSteps.find((s) => s.stepOrder === (prj.currentStepOrder || 1));
    const currentPositionIds: string[] = currentStepObj
      ? currentStepObj.positionIds
      : prj.currentPositionId
      ? [prj.currentPositionId]
      : [];
    const currentPositions = currentPositionIds
      .map((pid) => posMap.get(pid))
      .filter((p): p is { id: string; title: string; color?: string } => Boolean(p));

    const currentPositionTitle =
      currentPositions.length > 0
        ? currentPositions.map((p) => p.title).join('، ')
        : prj.currentPositionTitle || currentStepObj?.positionTitle || '';

    const currentAssignees = isCompletedOrRejected
      ? []
      : resolveAssigneesForStepPositions(
          currentPositionIds,
          currentStepObj?.structureId || null,
          allUsers,
          allStructAssignments,
          posMap,
          currentStepObj?.config?.userIds
        );

    const currentStepApprovalProgress = isCompletedOrRejected
      ? null
      : buildStepApprovalProgress(
          prj.id,
          prj.currentStepOrder || 1,
          currentStepObj?.config?.approvalMode,
          currentAssignees,
          currentUser.id
        );

    const isDirectPosMatch = Boolean(
      !isCompletedOrRejected &&
      currentUser.positionId &&
      currentPositionIds.includes(currentUser.positionId)
    );
    const isStructPosMatch = Boolean(
      !isCompletedOrRejected &&
      currentPositionIds.length > 0 &&
      userStructureAssignments.some(
        (a) =>
          currentPositionIds.includes(a.positionId) &&
          (!currentStepObj?.structureId || a.structureId === currentStepObj.structureId)
      )
    );
    const isExplicitUserMatch = Boolean(
      !isCompletedOrRejected &&
      Array.isArray(currentStepObj?.config?.userIds) &&
      currentStepObj.config.userIds.includes(currentUser.id)
    );
    const isMyWorkflowTurn = hasWorkflow && (isDirectPosMatch || isStructPosMatch || isExplicitUserMatch);

    // Accurate deduplicated participant count across ALL positions + explicit users in all workflow steps
    const workflowParticipantIds = new Set<string>();
    for (const st of prjSteps) {
      const stAssignees = resolveAssigneesForStepPositions(
        st.positionIds || [],
        st.structureId || null,
        allUsers,
        allStructAssignments,
        posMap,
        st.config?.userIds
      );
      for (const a of stAssignees) {
        workflowParticipantIds.add(a.id);
      }
    }
    const workflowTotalParticipants = workflowParticipantIds.size;

    // Count unique users who have actually performed a workflow action on this project
    const participatedUserIds = new Set<string>();
    for (const l of prjLogs) {
      if (WORKFLOW_PARTICIPATION_ACTIONS.has(l.action) && l.fromUserId) {
        participatedUserIds.add(l.fromUserId);
      }
    }
    for (const sa of allStepApprovals) {
      if (sa.projectId === prj.id && sa.userId) {
        participatedUserIds.add(sa.userId);
      }
    }
    const workflowParticipatedCount = participatedUserIds.size;

    const projectExpectedVoters = hasWorkflow
      ? workflowTotalParticipants
      : (totalCouncilCount || 4);
    const expired = isDeadlineExpired(prj.deadline);

    // Always include currentUser's own vote so anyone with voting.cast (including senior admins) can vote & edit
    const myVote = db.prepare(`
      SELECT v.id, v.status, v.reason, v.votedAt
      FROM votes v
      WHERE v.projectId = ? AND v.userId = ?
    `).get(prj.id, currentUser.id);

    if (canViewConfidential) {
      // User with confidential voting inspection permission (Admin / Board Chair)
      const allVotes = db.prepare(`
        SELECT v.id, v.status, v.reason, v.votedAt, v.userId,
               u.name as userName, u.avatar as userAvatar,
               pos.title as userPositionTitle, pos.color as userPositionColor
        FROM votes v
        JOIN users u ON v.userId = u.id
        LEFT JOIN positions pos ON u.positionId = pos.id
        WHERE v.projectId = ?
        ORDER BY v.votedAt DESC
      `).all(prj.id);

      return {
        ...prj,
        hasWorkflow,
        projectTypeId: prj.projectTypeId || null,
        projectTypeTitle: prj.projectTypeTitle || prj.productionType || '',
        workflowParticipatedCount,
        workflowTotalParticipants,
        currentPositionIds,
        currentPositions,
        currentPositionTitle,
        currentAssignees,
        currentStepApprovalProgress,
        deliveryDate: prj.deliveryDate || '',
        isDeadlineExpired: expired,
        isMyWorkflowTurn,
        requirements,
        attachments: prjAttachments,
        attachmentCount: prjAttachments.length,
        majorityResult: majorityInfo.majority,
        voteCounts: majorityInfo.counts,
        totalCouncilMembers: projectExpectedVoters,
        hasVoted: !!myVote,
        userVote: myVote || null,
        allVotes,
        workflowSteps: prjSteps,
        workflowLogs: prjLogs,
      };
    } else {
      // Standard Council Member (CONFIDENTIALITY ENFORCED)
      return {
        ...prj,
        hasWorkflow,
        projectTypeId: prj.projectTypeId || null,
        projectTypeTitle: prj.projectTypeTitle || prj.productionType || '',
        workflowParticipatedCount,
        workflowTotalParticipants,
        currentPositionIds,
        currentPositions,
        currentPositionTitle,
        currentAssignees,
        currentStepApprovalProgress,
        deliveryDate: prj.deliveryDate || '',
        isDeadlineExpired: expired,
        isMyWorkflowTurn,
        requirements,
        attachments: prjAttachments,
        attachmentCount: prjAttachments.length,
        majorityResult: majorityInfo.majority,
        voteCounts: majorityInfo.counts,
        totalCouncilMembers: projectExpectedVoters,
        hasVoted: !!myVote,
        userVote: myVote || null,
        workflowSteps: prjSteps,
        workflowLogs: prjLogs,
      };
    }
  });

  if (!canViewAllProjects) {
    const cartableOnly = result.filter((p) => Boolean(p.isMyWorkflowTurn));
    const hasScopedCartableAccess = hasPermission(currentUser, ['projects.cartable.view', 'workflow.forward']);
    return res.json({
      projects: cartableOnly,
      restrictedView: cartableOnly.length === 0 && !hasScopedCartableAccess,
      scopedWorkflowCartable: hasScopedCartableAccess || cartableOnly.length > 0,
    });
  }

  res.json({ projects: result });
});

apiRouter.post('/projects', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'projects.create')) {
    return res.status(403).json({ error: 'شما مجاز به ایجاد پروژه جدید نیستید.' });
  }

  const { title, code, description, productionType, projectTypeId, location, deadline, deliveryDate, budgetEstimated, requirements, workflowId, status: requestedStatus } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'نام پروژه الزامی است.' });
  }

  let resolvedProductionType = productionType ? String(productionType).trim() : '';
  let resolvedProjectTypeId: string | null = projectTypeId || null;
  if (resolvedProjectTypeId) {
    const ptRow = db.prepare('SELECT id, title FROM project_types WHERE id = ?').get(resolvedProjectTypeId) as any;
    if (ptRow) {
      if (!resolvedProductionType) resolvedProductionType = ptRow.title;
    } else {
      resolvedProjectTypeId = null;
    }
  }
  if (!resolvedProductionType) resolvedProductionType = 'طرح عمومی شورا';

  const id = `prj-${Date.now()}`;
  const prjCode = code && code.trim() ? code.trim() : `PRJ-${Math.floor(1000 + Math.random() * 9000)}`;
  const workflowTrackingCode = generateUniqueWorkflowTrackingCode();
  const now = new Date().toISOString();

  // Resolve target workflow: specified or default workflow in database
  let targetWorkflowId = workflowId;
  if (!targetWorkflowId) {
    const defaultWf = db.prepare('SELECT id FROM workflows WHERE isDefault = 1 LIMIT 1').get() as any;
    targetWorkflowId = defaultWf?.id || 'wf-standard';
  }

  const wfStepsCount = (db.prepare('SELECT count(*) as count FROM workflow_steps WHERE workflowId = ?').get(targetWorkflowId) as any)?.count || 0;
  if (requestedStatus === 'APPROVED' && wfStepsCount > 0 && !hasPermission(currentUser, 'projects.manual_approve')) {
    return res.status(403).json({ error: 'امکان تایید نهایی دستی بدون طی گردش کار وجود ندارد (نیازمند دسترسی تایید نهایی دستی).' });
  }

  const initialStatus = requestedStatus === 'APPROVED' ? 'APPROVED' : 'IN_REVIEW';

  // Find first step position of this workflow
  const firstStep = db.prepare('SELECT positionId, positionIdsJson FROM workflow_steps WHERE workflowId = ? ORDER BY stepOrder ASC LIMIT 1').get(targetWorkflowId) as any;
  const firstStepPosIds = parseStepPositionIds(firstStep);
  const initialPositionId = firstStepPosIds[0] || firstStep?.positionId || null;

  try {
    db.prepare(`
      INSERT INTO projects (
        id, title, code, description, productionType, projectTypeId, location, deadline, deliveryDate, budgetEstimated,
        status, majorityResult, requirementsJson, createdById, workflowId, currentStepOrder, currentPositionId, workflowTrackingCode, createdAt, updatedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, 1, ?, ?, ?, ?)
    `).run(
      id,
      title.trim(),
      prjCode,
      description || '',
      resolvedProductionType,
      resolvedProjectTypeId,
      location || '',
      deadline || '',
      deliveryDate || '',
      budgetEstimated || '',
      initialStatus,
      JSON.stringify(requirements || {}),
      currentUser.id,
      targetWorkflowId,
      initialPositionId,
      workflowTrackingCode,
      now,
      now
    );

    // Record initial PROJECT_CREATED audit log in workflow history
    recordProjectHistory({
      projectId: id,
      stepOrder: 1,
      fromUserId: currentUser.id,
      toPositionId: initialPositionId,
      action: 'PROJECT_CREATED',
      comment: `ثبت اولیه پروژه «${title.trim()}» و ورود به گردش کار (کد گردش: ${workflowTrackingCode})`,
      createdAt: now,
    });

    // Broadcast notification to Council Chat
    db.prepare(`
      INSERT INTO messages (id, senderId, receiverId, isGroup, content, projectId, createdAt)
      VALUES (?, ?, NULL, 1, ?, ?, ?)
    `).run(
      `msg-${randomUUID().substring(0, 8)}`,
      currentUser.id,
      `طرح جدید «${title.trim()}» با کد پروژه ${prjCode} و کد رهگیری گردش کار ${workflowTrackingCode} ثبت شد و در کارتابل ارزیابی قرار گرفت.`,
      id,
      now
    );

    // Dispatch SMS trigger according to defined rules
    triggerSmsForEvent({
      eventType: 'PROJECT_CREATED',
      project: {
        id,
        title: title.trim(),
        code: prjCode,
        author: currentUser.name,
        creatorId: currentUser.id,
        budget: budgetEstimated,
        budgetEstimated,
        deadline,
        location,
      },
      actor: currentUser,
    }).catch(console.error);

    res.json({ success: true, projectId: id, workflowTrackingCode });
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'کد پروژه تکراری است.' });
    }
    res.status(500).json({ error: 'خطا در ثبت پروژه.' });
  }
});

apiRouter.put('/projects/:id', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'projects.edit')) {
    return res.status(403).json({ error: 'شما مجاز به ویرایش پروژه نیستید.' });
  }

  const { id } = req.params;
  const prevProject = db.prepare('SELECT id, title, status, deadline, workflowId, currentStepOrder, currentPositionId, projectTypeId FROM projects WHERE id = ?').get(id) as any;
  const { title, code, description, productionType, projectTypeId, location, deadline, deliveryDate, budgetEstimated, requirements, status, workflowId } = req.body;

  // Guard: Manual final approval of workflow projects requires explicit projects.manual_approve permission (even for ADMIN)
  if (status === 'APPROVED' && prevProject?.status !== 'APPROVED') {
    const effectiveWfId = workflowId || prevProject?.workflowId || 'wf-standard';
    const hasWorkflowSteps = ((db.prepare('SELECT count(*) as count FROM workflow_steps WHERE workflowId = ?').get(effectiveWfId) as any)?.count || 0) > 0;
    if (hasWorkflowSteps && !hasPermission(currentUser, 'projects.manual_approve')) {
      return res.status(403).json({
        error: 'امکان تایید نهایی دستی وجود ندارد؛ پروژه باید از طریق مراحل گردش کار تایید شود (نیازمند دسترسی تایید نهایی دستی).',
      });
    }
  }

  let resolvedProjectTypeId = projectTypeId !== undefined ? (projectTypeId || null) : prevProject?.projectTypeId || null;
  let resolvedProductionType = productionType !== undefined ? String(productionType || '') : undefined;
  if (resolvedProjectTypeId) {
    const ptRow = db.prepare('SELECT id, title FROM project_types WHERE id = ?').get(resolvedProjectTypeId) as any;
    if (ptRow) {
      if (!resolvedProductionType) resolvedProductionType = ptRow.title;
    } else {
      resolvedProjectTypeId = null;
    }
  }

  const now = new Date().toISOString();
  const isWorkflowChanged = Boolean(workflowId && prevProject && workflowId !== prevProject.workflowId);

  let nextStepOrder = prevProject?.currentStepOrder || 1;
  let nextPositionId = prevProject?.currentPositionId || null;
  if (isWorkflowChanged) {
    nextStepOrder = 1;
    const firstStep = db.prepare('SELECT positionId, positionIdsJson FROM workflow_steps WHERE workflowId = ? ORDER BY stepOrder ASC LIMIT 1').get(workflowId) as any;
    const firstPosIds = parseStepPositionIds(firstStep);
    nextPositionId = firstPosIds[0] || firstStep?.positionId || null;
    db.prepare('DELETE FROM workflow_step_approvals WHERE projectId = ?').run(id);
  }

  db.prepare(`
    UPDATE projects
    SET title = ?, code = ?, description = ?, productionType = COALESCE(?, productionType), projectTypeId = ?, location = ?,
        deadline = ?, deliveryDate = ?, budgetEstimated = ?, requirementsJson = ?, status = COALESCE(?, status),
        workflowId = COALESCE(?, workflowId), currentStepOrder = ?, currentPositionId = ?, updatedAt = ?
    WHERE id = ?
  `).run(
    title,
    code,
    description || '',
    resolvedProductionType !== undefined ? resolvedProductionType : null,
    resolvedProjectTypeId,
    location || '',
    deadline || '',
    deliveryDate || '',
    budgetEstimated || '',
    JSON.stringify(requirements || {}),
    status || null,
    workflowId || null,
    nextStepOrder,
    nextPositionId,
    now,
    id
  );

  // Record audit history for edit / status change / deadline extension
  if (prevProject) {
    const statusLabels: Record<string, string> = {
      IN_REVIEW: 'در حال بررسی',
      APPROVED: 'تایید نهایی',
      NEEDS_REVISION: 'نیازمند اصلاح',
      REJECTED: 'رد شده',
    };
    const isStatusChanged = Boolean(status && status !== prevProject.status);
    const changes: string[] = [];
    if (isStatusChanged) {
      changes.push(`تغییر وضعیت از «${statusLabels[prevProject.status] || prevProject.status}» به «${statusLabels[status] || status}»`);
    }
    if ((deadline || '') !== (prevProject.deadline || '')) {
      changes.push(`بروزرسانی مهلت ارزیابی به «${deadline || 'بدون مهلت'}»`);
    }
    if (isWorkflowChanged) {
      changes.push('تغییر فرآیند گردش کار و بازگشت به گام اول');
    }
    if (title && title !== prevProject.title) {
      changes.push(`تغییر عنوان به «${title}»`);
    }
    recordProjectHistory({
      projectId: id,
      stepOrder: nextStepOrder,
      fromUserId: currentUser.id,
      toPositionId: nextPositionId,
      action: isStatusChanged ? 'STATUS_CHANGED' : 'PROJECT_EDITED',
      comment: changes.length > 0 ? changes.join(' • ') : `ویرایش مشخصات پروژه «${title || prevProject.title}»`,
      createdAt: now,
    });
  }

  res.json({ success: true });
});

// Explicit manual final approval outside workflow (strictly requires projects.manual_approve even for ADMIN)
apiRouter.post('/projects/:id/manual-approve', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'projects.manual_approve')) {
    return res.status(403).json({
      error: 'عدم دسترسی: فقط کاربران دارای مجوز «تایید نهایی دستی (خارج از گردش کار)» مجاز به تایید دستی پروژه هستند.',
    });
  }

  const { id } = req.params;
  const { comment } = req.body || {};
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
  if (!project) {
    return res.status(404).json({ error: 'پروژه یافت نشد.' });
  }

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM workflow_step_approvals WHERE projectId = ?').run(id);
    db.prepare("UPDATE projects SET status = 'APPROVED', updatedAt = ? WHERE id = ?").run(now, id);

    recordProjectHistory({
      projectId: id,
      stepOrder: project.currentStepOrder || 1,
      fromUserId: currentUser.id,
      toPositionId: project.currentPositionId || null,
      action: 'MANUAL_APPROVED',
      comment: comment?.trim()
        ? `تایید نهایی دستی خارج از گردش کار — ${comment.trim()}`
        : 'تایید نهایی دستی پروژه توسط دارنده مجوز ویژه (خارج از روال عادی گردش کار)',
      createdAt: now,
    });

    db.prepare(`
      INSERT INTO messages (id, senderId, receiverId, isGroup, content, projectId, createdAt)
      VALUES (?, ?, NULL, 1, ?, ?, ?)
    `).run(
      `msg-${randomUUID().substring(0, 8)}`,
      currentUser.id,
      `پروژه «${project.title}» توسط ${currentUser.name} با مجوز تایید نهایی دستی به تصویب رسید.`,
      id,
      now
    );
  });
  tx();

  res.json({ success: true, status: 'APPROVED' });
});

apiRouter.delete('/projects/:id', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'projects.delete')) {
    return res.status(403).json({ error: 'شما مجاز به حذف پروژه نیستید.' });
  }
  const { id } = req.params;
  db.prepare('DELETE FROM workflow_step_approvals WHERE projectId = ?').run(id);
  db.prepare('DELETE FROM project_attachments WHERE projectId = ?').run(id);
  db.prepare('DELETE FROM votes WHERE projectId = ?').run(id);
  db.prepare('DELETE FROM messages WHERE projectId = ?').run(id);
  db.prepare('DELETE FROM workflow_logs WHERE projectId = ?').run(id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  res.json({ success: true });
});

// --------------------------------------------------------------------------
// 6.5. PROJECT ATTACHMENTS & FILES (آپلود، حذف، جایگزینی و دانلود فایل‌های پروژه)
// --------------------------------------------------------------------------

// List attachments for a specific project
apiRouter.get('/projects/:id/attachments', (req: Request, res: Response) => {
  const { id: projectId } = req.params;
  const attachments = db.prepare(`
    SELECT a.id, a.projectId, a.fileName, a.fileSize, a.fileType, a.uploadedBy, a.createdAt,
           u.name as uploaderName
    FROM project_attachments a
    LEFT JOIN users u ON a.uploadedBy = u.id
    WHERE a.projectId = ?
    ORDER BY a.createdAt DESC
  `).all(projectId);

  res.json({ attachments });
});

// Get single attachment details (including data)
apiRouter.get('/projects/:id/attachments/:attachmentId', (req: Request, res: Response) => {
  const { id: projectId, attachmentId } = req.params;
  const attachment = db.prepare(`
    SELECT a.*, u.name as uploaderName
    FROM project_attachments a
    LEFT JOIN users u ON a.uploadedBy = u.id
    WHERE a.id = ? AND a.projectId = ?
  `).get(attachmentId, projectId);

  if (!attachment) {
    return res.status(404).json({ error: 'فایل پیوست یافت نشد.' });
  }

  res.json({ attachment });
});

// Direct Download endpoint (supports disk streaming for files up to 10GB and legacy base64)
apiRouter.get('/attachments/:id/download', (req: Request, res: Response) => {
  const { id } = req.params;
  const att = db.prepare('SELECT * FROM project_attachments WHERE id = ?').get(id) as any;
  if (!att) {
    return res.status(404).json({ error: 'فایل پیوست یافت نشد.' });
  }

  const mimeType = att.fileType || 'application/octet-stream';
  const safeFileName = encodeURIComponent(att.fileName);

  // 1. If stored on disk, stream directly to response (O(1) memory for up to 10GB)
  if (att.filePath) {
    const fullPath = path.resolve(uploadsDir, att.filePath);
    if (fs.existsSync(fullPath)) {
      try {
        const stat = fs.statSync(fullPath);
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
        res.setHeader('Content-Length', stat.size);
        const stream = fs.createReadStream(fullPath);
        stream.pipe(res);
        return;
      } catch (err: any) {
        return res.status(500).json({ error: 'خطا در خواندن فایل از دیسک.' });
      }
    }
  }

  // 2. Fallback to legacy in-database base64 data
  if (att.data) {
    try {
      let buffer: Buffer;
      if (att.data.startsWith('data:')) {
        const match = att.data.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          buffer = Buffer.from(match[2], 'base64');
        } else {
          const parts = att.data.split(',');
          buffer = Buffer.from(parts[1] || parts[0], 'base64');
        }
      } else {
        buffer = Buffer.from(att.data, 'base64');
      }

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
      return;
    } catch (err: any) {
      return res.status(500).json({ error: 'خطا در بارگیری فایل.' });
    }
  }

  res.status(404).json({ error: 'داده‌های فایل پیوست در سرور یافت نشد.' });
});

// Binary Streaming Upload endpoint (supports huge files up to 10GB without memory buffer)
apiRouter.post('/projects/:id/attachments/stream', async (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'احراز هویت نشده است.' });
  }

  const { id: projectId } = req.params;
  const project = db.prepare('SELECT id, title, createdById FROM projects WHERE id = ?').get(projectId) as any;
  if (!project) {
    return res.status(404).json({ error: 'پروژه مورد نظر یافت نشد.' });
  }

  const canUpload =
    hasPermission(currentUser, 'projects.edit') ||
    (hasPermission(currentUser, 'projects.create') && project.createdById === currentUser.id);
  if (!canUpload) {
    return res.status(403).json({ error: 'عدم دسترسی: شما مجاز به پیوست فایل برای این پروژه نیستید.' });
  }

  const rawFileName = (req.query.fileName as string) || (req.headers['x-file-name'] as string) || 'attachment.dat';
  const fileName = decodeURIComponent(rawFileName);
  const fileType = (req.headers['content-type'] as string) || 'application/octet-stream';

  // Read configurable max file size limit from system settings (default: 1024 MB = 1 GB, configurable up to 10240 MB = 10 GB)
  const maxSetting = db.prepare("SELECT value FROM system_settings WHERE key = 'max_file_size_mb'").get() as any;
  const maxMb = parseInt(maxSetting?.value || '1024', 10);
  const maxBytes = maxMb * 1024 * 1024;

  const headerContentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (headerContentLength > maxBytes) {
    const sizeDisplay = (headerContentLength / (1024 * 1024)).toFixed(1);
    const maxDisplay = maxMb >= 1024 ? `${(maxMb / 1024).toFixed(1)} گیگابایت` : `${maxMb} مگابایت`;
    return res.status(413).json({
      error: `حجم فایل ارسالی (${sizeDisplay} مگابایت) بیش از سقف مجاز تعریف‌شده در تنظیمات سیستم (${maxDisplay}) است.`,
    });
  }

  const ext = path.extname(fileName) || '';
  const id = `att-${randomUUID().substring(0, 8)}`;
  const diskFileName = `${id}${ext}`;
  const diskFilePath = path.join(uploadsDir, diskFileName);

  try {
    let bytesWritten = 0;
    let limitExceeded = false;
    const fileWriteStream = fs.createWriteStream(diskFilePath);

    req.on('data', (chunk) => {
      bytesWritten += chunk.length;
      if (bytesWritten > maxBytes && !limitExceeded) {
        limitExceeded = true;
        fileWriteStream.destroy();
        try { if (fs.existsSync(diskFilePath)) fs.unlinkSync(diskFilePath); } catch (e) {}
      }
    });

    await pipeline(req, fileWriteStream);

    if (limitExceeded) {
      const maxDisplay = maxMb >= 1024 ? `${(maxMb / 1024).toFixed(1)} گیگابایت` : `${maxMb} مگابایت`;
      return res.status(413).json({
        error: `حجم فایل ارسالی از سقف مجاز تعریف‌شده در سیستم (${maxDisplay}) فراتر رفت.`,
      });
    }

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO project_attachments (id, projectId, fileName, fileSize, fileType, data, filePath, uploadedBy, createdAt)
      VALUES (?, ?, ?, ?, ?, '', ?, ?, ?)
    `).run(
      id,
      projectId,
      fileName.trim(),
      bytesWritten,
      fileType,
      diskFileName,
      currentUser.id,
      now
    );

    const sizeFormatted = bytesWritten >= 1024 * 1024 * 1024
      ? `${(bytesWritten / (1024 * 1024 * 1024)).toFixed(2)} گیگابایت`
      : `${(bytesWritten / (1024 * 1024)).toFixed(1)} مگابایت`;

    // Broadcast file addition notification to council chat
    db.prepare(`
      INSERT INTO messages (id, senderId, receiverId, isGroup, content, projectId, createdAt)
      VALUES (?, ?, NULL, 1, ?, ?, ?)
    `).run(
      `msg-${randomUUID().substring(0, 8)}`,
      currentUser.id,
      `فایل پیوست «${fileName.trim()}» با حجم ${sizeFormatted} توسط ${currentUser.name} اضافه گردید.`,
      projectId,
      now
    );

    const prjStepInfo = db.prepare('SELECT currentStepOrder, currentPositionId FROM projects WHERE id = ?').get(projectId) as any;
    recordProjectHistory({
      projectId,
      stepOrder: prjStepInfo?.currentStepOrder || 1,
      fromUserId: currentUser.id,
      toPositionId: prjStepInfo?.currentPositionId || null,
      action: 'ATTACHMENT_UPLOADED',
      comment: `پیوست فایل «${fileName.trim()}» (${sizeFormatted})`,
      createdAt: now,
    });

    const created = db.prepare(`
      SELECT a.id, a.projectId, a.fileName, a.fileSize, a.fileType, a.uploadedBy, a.createdAt,
             u.name as uploaderName
      FROM project_attachments a
      LEFT JOIN users u ON a.uploadedBy = u.id
      WHERE a.id = ?
    `).get(id);

    res.json({ success: true, attachment: created });
  } catch (err: any) {
    try { if (fs.existsSync(diskFilePath)) fs.unlinkSync(diskFilePath); } catch (e) {}
    if (!res.headersSent) {
      res.status(500).json({ error: 'خطا در بارگذاری و ذخیره فایل بر روی سرور: ' + err.message });
    }
  }
});

// Upload a new attachment to a project (JSON fallback)
apiRouter.post('/projects/:id/attachments', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'احراز هویت نشده است.' });
  }

  const { id: projectId } = req.params;
  const project = db.prepare('SELECT id, title, createdById FROM projects WHERE id = ?').get(projectId) as any;
  if (!project) {
    return res.status(404).json({ error: 'پروژه مورد نظر یافت نشد.' });
  }

  const canUpload =
    hasPermission(currentUser, 'projects.edit') ||
    (hasPermission(currentUser, 'projects.create') && project.createdById === currentUser.id);
  if (!canUpload) {
    return res.status(403).json({ error: 'عدم دسترسی: شما مجاز به پیوست فایل برای این پروژه نیستید.' });
  }

  const { fileName, fileSize, fileType, data } = req.body;
  if (!fileName || !fileName.trim() || !data) {
    return res.status(400).json({ error: 'نام فایل و داده‌های بارگذاری الزامی هستند.' });
  }

  const parsedSize = typeof fileSize === 'number' ? fileSize : parseInt(fileSize, 10) || 0;

  // Validate against system max file size
  const maxSetting = db.prepare("SELECT value FROM system_settings WHERE key = 'max_file_size_mb'").get() as any;
  const maxMb = parseInt(maxSetting?.value || '1024', 10);
  const maxBytes = maxMb * 1024 * 1024;

  if (parsedSize > maxBytes) {
    const maxDisplay = maxMb >= 1024 ? `${(maxMb / 1024).toFixed(1)} گیگابایت` : `${maxMb} مگابایت`;
    return res.status(413).json({
      error: `حجم فایل ارسالی بیش از سقف مجاز تعریف‌شده در سیستم (${maxDisplay}) است.`,
    });
  }

  const id = `att-${randomUUID().substring(0, 8)}`;
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO project_attachments (id, projectId, fileName, fileSize, fileType, data, uploadedBy, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      projectId,
      fileName.trim(),
      parsedSize,
      fileType || 'application/octet-stream',
      data,
      currentUser.id,
      now
    );

    // Broadcast file addition notification to council chat
    db.prepare(`
      INSERT INTO messages (id, senderId, receiverId, isGroup, content, projectId, createdAt)
      VALUES (?, ?, NULL, 1, ?, ?, ?)
    `).run(
      `msg-${randomUUID().substring(0, 8)}`,
      currentUser.id,
      `فایل جدید «${fileName.trim()}» توسط ${currentUser.name} به پروژه «${project.title}» پیوست شد.`,
      projectId,
      now
    );

    const prjStepInfo = db.prepare('SELECT currentStepOrder, currentPositionId FROM projects WHERE id = ?').get(projectId) as any;
    recordProjectHistory({
      projectId,
      stepOrder: prjStepInfo?.currentStepOrder || 1,
      fromUserId: currentUser.id,
      toPositionId: prjStepInfo?.currentPositionId || null,
      action: 'ATTACHMENT_UPLOADED',
      comment: `پیوست فایل «${fileName.trim()}»`,
      createdAt: now,
    });

    const created = db.prepare(`
      SELECT a.id, a.projectId, a.fileName, a.fileSize, a.fileType, a.uploadedBy, a.createdAt,
             u.name as uploaderName
      FROM project_attachments a
      LEFT JOIN users u ON a.uploadedBy = u.id
      WHERE a.id = ?
    `).get(id);

    res.json({ success: true, attachment: created });
  } catch (err: any) {
    res.status(500).json({ error: 'خطا در ذخیره فایل در پایگاه داده.' });
  }
});

// Delete an attachment from a project
apiRouter.delete('/projects/:id/attachments/:attachmentId', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'projects.edit')) {
    return res.status(403).json({ error: 'عدم دسترسی: شما مجاز به حذف فایل‌های پروژه نیستید.' });
  }

  const { id: projectId, attachmentId } = req.params;
  const project = db.prepare('SELECT id, title FROM projects WHERE id = ?').get(projectId) as any;
  const existing = db.prepare('SELECT * FROM project_attachments WHERE id = ? AND projectId = ?').get(attachmentId, projectId) as any;

  if (!existing) {
    return res.status(404).json({ error: 'فایل پیوست یافت نشد.' });
  }

  try {
    // Delete physical file from disk if present
    if (existing.filePath) {
      const fullPath = path.resolve(uploadsDir, existing.filePath);
      try {
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      } catch (e) {}
    }

    db.prepare('DELETE FROM project_attachments WHERE id = ? AND projectId = ?').run(attachmentId, projectId);

    // Broadcast file deletion notification
    if (project) {
      const delNow = new Date().toISOString();
      db.prepare(`
        INSERT INTO messages (id, senderId, receiverId, isGroup, content, projectId, createdAt)
        VALUES (?, ?, NULL, 1, ?, ?, ?)
      `).run(
        `msg-${randomUUID().substring(0, 8)}`,
        currentUser.id,
        `فایل «${existing.fileName}» توسط ${currentUser.name} از پروژه «${project.title}» حذف گردید.`,
        projectId,
        delNow
      );

      const prjStepInfo = db.prepare('SELECT currentStepOrder, currentPositionId FROM projects WHERE id = ?').get(projectId) as any;
      recordProjectHistory({
        projectId,
        stepOrder: prjStepInfo?.currentStepOrder || 1,
        fromUserId: currentUser.id,
        toPositionId: prjStepInfo?.currentPositionId || null,
        action: 'ATTACHMENT_DELETED',
        comment: `حذف فایل پیوست «${existing.fileName}»`,
        createdAt: delNow,
      });
    }

    res.json({ success: true, deletedId: attachmentId });
  } catch (err: any) {
    res.status(500).json({ error: 'خطا در حذف فایل.' });
  }
});

// --------------------------------------------------------------------------
// 7. VOTING
// --------------------------------------------------------------------------

apiRouter.post('/projects/:id/vote', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'voting.cast')) {
    return res.status(403).json({ error: 'شما مجوز ثبت رای در شورا را ندارید.' });
  }

  const { id: projectId } = req.params;
  const { status, reason } = req.body;

  const validStatuses = ['APPROVED', 'REJECTED', 'NEEDS_REVISION'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'نوع رای نامعتبر است.' });
  }

  // MANDATORY: If NEEDS_REVISION, reason is strictly required!
  if (status === 'NEEDS_REVISION' && (!reason || !reason.trim())) {
    return res.status(400).json({
      error: 'در صورت انتخاب گزینه «نیاز به اصلاح»، شرح دلیل و موارد اصلاحی الزامی است.',
    });
  }

  const project = db.prepare('SELECT id, title, deadline, workflowId FROM projects WHERE id = ?').get(projectId) as any;
  if (!project) {
    return res.status(404).json({ error: 'پروژه مورد نظر یافت نشد.' });
  }

  // Enforce: Workflow-governed projects must be reviewed via workflow transitions, NOT separate council voting
  const wfStepsCount = project.workflowId
    ? ((db.prepare('SELECT count(*) as count FROM workflow_steps WHERE workflowId = ?').get(project.workflowId) as any)?.count || 0)
    : 0;
  if (wfStepsCount > 0) {
    return res.status(400).json({
      error: 'این پروژه دارای گردش کار است و تمام اقدامات و تاییدها باید صرفاً از طریق مراحل گردش کار ثبت شود.',
    });
  }

  // Enforce evaluation deadline check based on system settings
  const enforceSetting = db.prepare("SELECT value FROM system_settings WHERE key = 'enforce_deadline'").get() as any;
  const isEnforced = !enforceSetting || enforceSetting.value === 'true';
  if (isEnforced && isDeadlineExpired(project.deadline)) {
    return res.status(400).json({
      error: 'مهلت قانونی ارزیابی این پروژه به پایان رسیده است و ثبت رای امکان‌پذیر نیست. ثبت‌کننده طرح یا مدیر ارشد سیستم می‌تواند با ویرایش پروژه و تمدید تاریخ، مجدداً امکان رای‌گیری را بازگشایی نماید.',
    });
  }

  const voteId = `vot-${randomUUID().substring(0, 8)}`;
  const now = new Date().toISOString();

  const existingVote = db.prepare('SELECT id FROM votes WHERE projectId = ? AND userId = ?').get(projectId, currentUser.id);

  if (existingVote) {
    db.prepare(`
      UPDATE votes
      SET status = ?, reason = ?, votedAt = ?
      WHERE projectId = ? AND userId = ?
    `).run(status, reason ? reason.trim() : null, now, projectId, currentUser.id);
  } else {
    db.prepare(`
      INSERT INTO votes (id, projectId, userId, status, reason, votedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(voteId, projectId, currentUser.id, status, reason ? reason.trim() : null, now);
  }

  // Recalculate majority
  const majorityInfo = calculateMajorityForProject(projectId);
  db.prepare(`
    UPDATE projects
    SET majorityResult = ?, updatedAt = ?
    WHERE id = ?
  `).run(majorityInfo.majority, now, projectId);

  // Record vote action in workflow/audit history (comment redacted for non-confidential viewers)
  const voteStatusLabel =
    status === 'APPROVED' ? 'موافق / تایید' : status === 'REJECTED' ? 'مخالف / رد' : 'نیاز به اصلاح';
  const prjStepInfo = db.prepare('SELECT currentStepOrder, currentPositionId FROM projects WHERE id = ?').get(projectId) as any;
  recordProjectHistory({
    projectId,
    stepOrder: prjStepInfo?.currentStepOrder || 1,
    fromUserId: currentUser.id,
    toPositionId: prjStepInfo?.currentPositionId || null,
    action: existingVote ? 'VOTE_UPDATED' : 'VOTE_CAST',
    comment: `${existingVote ? 'ویرایش' : 'ثبت'} رای: ${voteStatusLabel}${reason && reason.trim() ? ` — «${reason.trim()}»` : ''}`,
    createdAt: now,
  });

  // Trigger SMS rules for vote and majority outcome
  const prj = db.prepare('SELECT id, title, code, createdById, budgetEstimated, deadline, location FROM projects WHERE id = ?').get(projectId) as any;
  if (prj) {
    const projectPayload = {
      id: prj.id,
      title: prj.title,
      code: prj.code,
      creatorId: prj.createdById,
      budget: prj.budgetEstimated,
      budgetEstimated: prj.budgetEstimated,
      deadline: prj.deadline,
      location: prj.location,
    };

    triggerSmsForEvent({
      eventType: 'NEW_VOTE_CAST',
      project: projectPayload,
      actor: currentUser,
      extraData: { vote_status: status },
    }).catch(console.error);

    if (majorityInfo.majority === 'APPROVED') {
      triggerSmsForEvent({
        eventType: 'PROJECT_APPROVED',
        project: { ...projectPayload, majorityResult: 'APPROVED' },
        actor: currentUser,
      }).catch(console.error);
    } else if (majorityInfo.majority === 'REJECTED') {
      triggerSmsForEvent({
        eventType: 'PROJECT_REJECTED',
        project: { ...projectPayload, majorityResult: 'REJECTED' },
        actor: currentUser,
      }).catch(console.error);
    } else if (majorityInfo.majority === 'NEEDS_REVISION') {
      triggerSmsForEvent({
        eventType: 'PROJECT_NEEDS_REVISION',
        project: { ...projectPayload, majorityResult: 'NEEDS_REVISION' },
        actor: currentUser,
      }).catch(console.error);
    }
  }

  res.json({
    success: true,
    vote: {
      status,
      reason: reason ? reason.trim() : null,
      votedAt: now,
    },
    majorityResult: majorityInfo.majority,
  });
});

// --------------------------------------------------------------------------
// 8. CHAT & MESSAGES
// --------------------------------------------------------------------------

apiRouter.get('/messages', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'احراز هویت نشده است.' });
  }
  if (!hasPermission(currentUser, ['chat.view', 'chat.group.send', 'chat.direct.send'])) {
    return res.json({ messages: [], restrictedView: true });
  }

  const isGroup = req.query.isGroup === '1' || req.query.isGroup === 'true';
  const partnerId = req.query.partnerId as string;

  let messages: any[] = [];

  if (isGroup) {
    messages = db.prepare(`
      SELECT m.*, u.name as senderName, u.avatar as senderAvatar, u.role as senderRole,
             pos.title as senderPosition, p.title as projectTitle
      FROM messages m
      JOIN users u ON m.senderId = u.id
      LEFT JOIN positions pos ON u.positionId = pos.id
      LEFT JOIN projects p ON m.projectId = p.id
      WHERE m.isGroup = 1
      ORDER BY m.createdAt ASC
      LIMIT 150
    `).all();
  } else if (partnerId) {
    messages = db.prepare(`
      SELECT m.*, u.name as senderName, u.avatar as senderAvatar, u.role as senderRole,
             pos.title as senderPosition, p.title as projectTitle
      FROM messages m
      JOIN users u ON m.senderId = u.id
      LEFT JOIN positions pos ON u.positionId = pos.id
      LEFT JOIN projects p ON m.projectId = p.id
      WHERE m.isGroup = 0 AND (
        (m.senderId = ? AND m.receiverId = ?) OR
        (m.senderId = ? AND m.receiverId = ?)
      )
      ORDER BY m.createdAt ASC
      LIMIT 150
    `).all(currentUser.id, partnerId, partnerId, currentUser.id);
  }

  res.json({ messages });
});

apiRouter.post('/messages', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'احراز هویت نشده است.' });
  }

  const { content, isGroup, receiverId, projectId } = req.body;
  const requiredPerm = isGroup ? 'chat.group.send' : 'chat.direct.send';
  if (!hasPermission(currentUser, requiredPerm)) {
    return res.status(403).json({
      error: isGroup ? 'شما مجاز به ارسال پیام در تالار گروهی شورا نیستید.' : 'شما مجاز به ارسال پیام خصوصی نیستید.',
    });
  }
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'متن پیام خالی است.' });
  }

  const id = `msg-${randomUUID().substring(0, 8)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO messages (id, senderId, receiverId, isGroup, content, projectId, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    currentUser.id,
    isGroup ? null : (receiverId || null),
    isGroup ? 1 : 0,
    content.trim(),
    projectId || null,
    now
  );

  const message = db.prepare(`
    SELECT m.*, u.name as senderName, u.avatar as senderAvatar, u.role as senderRole,
           pos.title as senderPosition, p.title as projectTitle
    FROM messages m
    JOIN users u ON m.senderId = u.id
    LEFT JOIN positions pos ON u.positionId = pos.id
    LEFT JOIN projects p ON m.projectId = p.id
    WHERE m.id = ?
  `).get(id);

  res.json({ success: true, message });
});

// --------------------------------------------------------------------------
// 9. DASHBOARD STATS
// --------------------------------------------------------------------------

apiRouter.get('/dashboard/stats', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'احراز هویت نشده است.' });
  }

  const totalProjects = (db.prepare('SELECT count(*) as count FROM projects').get() as any)?.count || 0;
  const totalCouncil = (db.prepare("SELECT count(*) as count FROM users WHERE role = 'COUNCIL'").get() as any)?.count || 0;
  const totalVotesCast = (db.prepare('SELECT count(*) as count FROM votes').get() as any)?.count || 0;
  const totalPositions = (db.prepare('SELECT count(*) as count FROM positions').get() as any)?.count || 0;
  const activeWorkflows = (db.prepare('SELECT count(*) as count FROM workflows').get() as any)?.count || 0;

  const approvedMajority = (db.prepare("SELECT count(*) as count FROM projects WHERE majorityResult = 'APPROVED'").get() as any)?.count || 0;
  const revisionMajority = (db.prepare("SELECT count(*) as count FROM projects WHERE majorityResult = 'NEEDS_REVISION'").get() as any)?.count || 0;
  const rejectedMajority = (db.prepare("SELECT count(*) as count FROM projects WHERE majorityResult = 'REJECTED'").get() as any)?.count || 0;
  const pendingMajority = (db.prepare("SELECT count(*) as count FROM projects WHERE majorityResult = 'PENDING' OR majorityResult = 'TIED'").get() as any)?.count || 0;

  let userPendingCount = 0;
  if (hasPermission(currentUser, 'voting.cast') && hasPermission(currentUser, 'projects.view')) {
    const unvoted = db.prepare(`
      SELECT count(*) as count FROM projects p
      WHERE NOT EXISTS (SELECT 1 FROM votes v WHERE v.projectId = p.id AND v.userId = ?)
    `).get(currentUser.id) as any;
    userPendingCount = unvoted?.count || 0;
  }

  res.json({
    totalProjects,
    totalCouncil,
    totalVotesCast,
    approvedMajority,
    revisionMajority,
    rejectedMajority,
    pendingMajority,
    userPendingCount,
    totalPositions,
    activeWorkflows,
  });
});

// --------------------------------------------------------------------------
// 9. SYSTEM SETTINGS (تنظیمات سامانه و مهلت ارزیابی)
// --------------------------------------------------------------------------

apiRouter.get('/settings', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'احراز هویت نشده است.' });
  }

  const canSeeSensitiveSettings = hasPermission(currentUser, ['settings.view', 'settings.edit', 'sms.rules.view', 'sms.rules.create', 'sms.rules.edit']);
  const list = db.prepare('SELECT key, value, description, updatedAt FROM system_settings').all() as any[];
  const settings: Record<string, string> = {};
  for (const item of list) {
    if (!canSeeSensitiveSettings && item.key === 'sms_api_key') {
      continue;
    }
    settings[item.key] = item.value;
  }

  res.json({ settings, list: canSeeSensitiveSettings ? list : list.filter((i) => i.key !== 'sms_api_key') });
});

apiRouter.put('/settings', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, ['settings.edit', 'sms.rules.edit'])) {
    return res.status(403).json({ error: 'دسترسی غیرمجاز: شما مجوز ویرایش تنظیمات سامانه را ندارید.' });
  }

  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'داده‌های ارسالی تنظیمات نامعتبر است.' });
  }

  const now = new Date().toISOString();
  const updateStmt = db.prepare(`
    INSERT INTO system_settings (key, value, updatedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
  `);

  const tx = db.transaction(() => {
    for (const [key, val] of Object.entries(settings)) {
      updateStmt.run(key, String(val), now);
    }
  });
  tx();

  const updatedList = db.prepare('SELECT key, value, description, updatedAt FROM system_settings').all() as any[];
  const updatedSettings: Record<string, string> = {};
  for (const item of updatedList) {
    updatedSettings[item.key] = item.value;
  }

  res.json({ success: true, settings: updatedSettings, list: updatedList });
});

// --------------------------------------------------------------------------
// 10. PUBLIC SETTINGS & LOGIN BRANDING (قابل دسترسی برای عموم و صفحه لاگین)
// --------------------------------------------------------------------------

apiRouter.get('/system/public-settings', (req: Request, res: Response) => {
  const list = db.prepare(`
    SELECT key, value FROM system_settings 
    WHERE key IN ('login_title', 'login_subtitle', 'login_logo_url', 'max_file_size_mb')
  `).all() as any[];
  const settings: Record<string, string> = {
    login_title: 'شورای تولید و ارزیابی',
    login_subtitle: 'سامانه جامع کارتابل مصوبات و مدیریت طرح‌ها',
    login_logo_url: '',
    max_file_size_mb: '1024',
  };
  for (const item of list) {
    settings[item.key] = item.value;
  }
  res.json({
    settings,
    ...settings,
    login_title: settings.login_title,
    login_subtitle: settings.login_subtitle,
    login_logo_url: settings.login_logo_url || null,
  });
});

// Upload login logo image
apiRouter.post('/system/upload-logo', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'settings.edit')) {
    return res.status(403).json({ error: 'شما مجوز تغییر لوگو و ظاهر سامانه را ندارید.' });
  }

  const { logoData, fileName } = req.body;
  if (!logoData || typeof logoData !== 'string') {
    return res.status(400).json({ error: 'تصویر ارسالی نامعتبر است.' });
  }

  try {
    let logoUrl = logoData;
    // If it's a data URI (base64), save to uploads directory
    if (logoData.startsWith('data:image')) {
      const extMatch = logoData.match(/^data:image\/([a-zA-Z0-9+]+);base64,/);
      const ext = extMatch ? extMatch[1].replace('svg+xml', 'svg') : 'png';
      const base64Content = logoData.replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, '');
      const buffer = Buffer.from(base64Content, 'base64');
      
      const fileId = `logo_${Date.now()}.${ext}`;
      const filePath = path.resolve(uploadsDir, fileId);
      fs.writeFileSync(filePath, buffer);
      logoUrl = `/api/system/logo?t=${Date.now()}`;
      
      // Update system settings
      db.prepare(`
        INSERT INTO system_settings (key, value, updatedAt)
        VALUES ('login_logo_url', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
      `).run(logoUrl, new Date().toISOString());

      db.prepare(`
        INSERT INTO system_settings (key, value, updatedAt)
        VALUES ('login_logo_path', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
      `).run(fileId, new Date().toISOString());
    } else {
      db.prepare(`
        INSERT INTO system_settings (key, value, updatedAt)
        VALUES ('login_logo_url', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
      `).run(logoUrl, new Date().toISOString());
    }

    res.json({ success: true, logoUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'خطا در بارگذاری لوگو' });
  }
});

// Serve current logo image
apiRouter.get('/system/logo', (req: Request, res: Response) => {
  const logoPathSetting = db.prepare("SELECT value FROM system_settings WHERE key = 'login_logo_path'").get() as any;
  if (logoPathSetting && logoPathSetting.value) {
    const fullPath = path.resolve(uploadsDir, logoPathSetting.value);
    if (fs.existsSync(fullPath)) {
      const ext = path.extname(fullPath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
        '.ico': 'image/x-icon',
      };
      res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
      return res.sendFile(fullPath);
    }
  }

  // Fallback to data url if stored directly
  const logoUrlSetting = db.prepare("SELECT value FROM system_settings WHERE key = 'login_logo_url'").get() as any;
  if (logoUrlSetting?.value && logoUrlSetting.value.startsWith('data:image')) {
    const match = logoUrlSetting.value.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      res.setHeader('Content-Type', match[1]);
      return res.send(Buffer.from(match[2], 'base64'));
    }
  }

  res.status(404).send('Logo not found');
});

// --------------------------------------------------------------------------
// 11. SMS GATEWAY & TRIGGER RULES (وب‌سرویس و شرط‌های ارسال پیامک)
// --------------------------------------------------------------------------

// Get all SMS rules
apiRouter.get('/sms/rules', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) return res.status(401).json({ error: 'احراز هویت نشده است.' });
  if (!hasPermission(currentUser, ['sms.rules.view', 'sms.rules.create', 'sms.rules.edit', 'sms.rules.delete', 'settings.view'])) {
    return res.status(403).json({ error: 'شما مجوز مشاهده شرط‌های پیامک را ندارید.' });
  }

  const rawRules = db.prepare('SELECT * FROM sms_rules ORDER BY createdAt DESC').all() as any[];
  const rules = rawRules.map((r) => {
    let targetPositionIds: string[] = [];
    let actorPositionIds: string[] = [];
    let actorUserIds: string[] = [];
    let customNumbers: string[] = [];

    try { targetPositionIds = JSON.parse(r.targetPositionIds || '[]'); } catch (e) {}
    try { actorPositionIds = JSON.parse(r.actorPositionIds || '[]'); } catch (e) {}
    try { actorUserIds = JSON.parse(r.actorUserIds || '[]'); } catch (e) {}
    if (r.customPhones) {
      customNumbers = r.customPhones.split(/[,;\n\s]+/).map((s: string) => s.trim()).filter((s: string) => s.length >= 10);
    }

    return {
      ...r,
      title: r.title || r.description || 'شرط ارسال پیامک',
      event: r.eventType,
      target: r.targetType,
      template: r.messageTemplate,
      actorPositionIds,
      actorUserIds,
      targetPositionIds,
      targetCustomNumbers: customNumbers,
      enabled: Boolean(r.enabled),
    };
  });

  res.json({ rules });
});

// Create SMS rule
apiRouter.post('/sms/rules', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'sms.rules.create')) {
    return res.status(403).json({ error: 'شما مجوز ثبت شرط پیامک جدید را ندارید.' });
  }

  const {
    title,
    description,
    event,
    eventType,
    target,
    targetType,
    actorPositionIds,
    actorUserIds,
    targetPositionIds,
    targetCustomNumbers,
    customPhones,
    template,
    messageTemplate,
    enabled,
  } = req.body;

  const finalTitle = (title || description || '').trim() || 'شرط ارسال پیامک';
  const finalEvent = eventType || event;
  const finalTarget = targetType || target || 'ALL_COUNCIL';
  const finalTemplate = (messageTemplate || template || '').trim();

  if (!finalTemplate) {
    return res.status(400).json({ error: 'متن قالب پیامک الزامی است.' });
  }
  if (!finalEvent) {
    return res.status(400).json({ error: 'انتخاب نوع رویداد فعال‌ساز الزامی است.' });
  }

  // Handle custom phones array or string
  let cleanPhones = '';
  if (Array.isArray(targetCustomNumbers) && targetCustomNumbers.length > 0) {
    cleanPhones = targetCustomNumbers.join(', ');
  } else if (customPhones) {
    cleanPhones = String(customPhones).trim();
  }

  const id = `rule-${randomUUID().substring(0, 8)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO sms_rules (
      id, title, eventType, targetType, actorPositionIds, actorUserIds,
      targetPositionIds, customPhones, messageTemplate, description, enabled, createdAt, updatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    finalTitle,
    finalEvent,
    finalTarget,
    JSON.stringify(actorPositionIds || []),
    JSON.stringify(actorUserIds || []),
    JSON.stringify(targetPositionIds || []),
    cleanPhones,
    finalTemplate,
    description?.trim() || finalTitle,
    enabled === false ? 0 : 1,
    now,
    now
  );

  res.json({ success: true, ruleId: id });
});

// Update SMS rule
apiRouter.put('/sms/rules/:id', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'sms.rules.edit')) {
    return res.status(403).json({ error: 'شما مجوز ویرایش شرط پیامک را ندارید.' });
  }

  const { id } = req.params;
  const {
    title,
    description,
    event,
    eventType,
    target,
    targetType,
    actorPositionIds,
    actorUserIds,
    targetPositionIds,
    targetCustomNumbers,
    customPhones,
    template,
    messageTemplate,
    enabled,
  } = req.body;

  const now = new Date().toISOString();
  const finalTitle = title !== undefined ? title.trim() : (description ? description.trim() : null);
  const finalEvent = eventType || event || null;
  const finalTarget = targetType || target || null;
  const finalTemplate = messageTemplate !== undefined ? messageTemplate.trim() : (template !== undefined ? template.trim() : null);

  let cleanPhones: string | null = null;
  if (targetCustomNumbers !== undefined) {
    cleanPhones = Array.isArray(targetCustomNumbers) ? targetCustomNumbers.join(', ') : String(targetCustomNumbers);
  } else if (customPhones !== undefined) {
    cleanPhones = String(customPhones);
  }

  db.prepare(`
    UPDATE sms_rules
    SET title = COALESCE(?, title),
        eventType = COALESCE(?, eventType),
        targetType = COALESCE(?, targetType),
        actorPositionIds = COALESCE(?, actorPositionIds),
        actorUserIds = COALESCE(?, actorUserIds),
        targetPositionIds = COALESCE(?, targetPositionIds),
        customPhones = COALESCE(?, customPhones),
        messageTemplate = COALESCE(?, messageTemplate),
        description = COALESCE(?, description),
        enabled = COALESCE(?, enabled),
        updatedAt = ?
    WHERE id = ?
  `).run(
    finalTitle,
    finalEvent,
    finalTarget,
    actorPositionIds !== undefined ? JSON.stringify(actorPositionIds) : null,
    actorUserIds !== undefined ? JSON.stringify(actorUserIds) : null,
    targetPositionIds !== undefined ? JSON.stringify(targetPositionIds) : null,
    cleanPhones,
    finalTemplate,
    description !== undefined ? description.trim() : null,
    enabled !== undefined ? (enabled ? 1 : 0) : null,
    now,
    id
  );

  res.json({ success: true });
});

// Toggle rule active/inactive
apiRouter.post('/sms/rules/:id/toggle', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'sms.rules.edit')) {
    return res.status(403).json({ error: 'دسترسی غیرمجاز برای تغییر وضعیت شرط پیامک.' });
  }

  const { id } = req.params;
  const rule = db.prepare('SELECT enabled FROM sms_rules WHERE id = ?').get(id) as any;
  if (!rule) return res.status(404).json({ error: 'شرط مورد نظر یافت نشد.' });

  const newStatus = rule.enabled ? 0 : 1;
  db.prepare('UPDATE sms_rules SET enabled = ?, updatedAt = ? WHERE id = ?').run(
    newStatus,
    new Date().toISOString(),
    id
  );

  res.json({ success: true, enabled: Boolean(newStatus) });
});

// Delete SMS rule
apiRouter.delete('/sms/rules/:id', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'sms.rules.delete')) {
    return res.status(403).json({ error: 'شما مجوز حذف شرط پیامک را ندارید.' });
  }

  const { id } = req.params;
  db.prepare('DELETE FROM sms_rules WHERE id = ?').run(id);
  res.json({ success: true });
});

// Send test SMS
apiRouter.post('/sms/send-test', async (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, ['sms.rules.create', 'sms.rules.edit'])) {
    return res.status(403).json({ error: 'شما مجوز ارسال پیامک تستی را ندارید.' });
  }

  const { phone, message } = req.body;
  if (!phone || !phone.trim()) {
    return res.status(400).json({ error: 'شماره تلفن همراه الزامی است.' });
  }

  const cleanPhone = phone.trim();
  const testMsg = message?.trim() || `پیامک تستی از سامانه کارتابل و مصوبات شورا.\nزمان: ${new Date().toLocaleTimeString('fa-IR')}`;

  const settingRows = db.prepare("SELECT key, value FROM system_settings WHERE key LIKE 'sms_%'").all() as any[];
  const settings: Record<string, string> = {};
  for (const row of settingRows) {
    settings[row.key] = row.value;
  }

  const result = await sendSmsViaProvider(cleanPhone, testMsg, settings);

  // Log in sms_logs
  const logId = `sms-${randomUUID().substring(0, 8)}`;
  db.prepare(`
    INSERT INTO sms_logs (id, ruleId, recipientPhone, recipientName, message, eventType, status, providerResponse, sentAt)
    VALUES (?, NULL, ?, ?, ?, 'TEST_SMS', ?, ?, ?)
  `).run(
    logId,
    cleanPhone,
    currentUser.name,
    testMsg,
    result.success ? (result.simulated ? 'SIMULATED' : 'SENT') : 'FAILED',
    result.providerResponse,
    new Date().toISOString()
  );

  res.json({
    success: result.success,
    simulated: result.simulated,
    message: result.providerResponse,
  });
});

// Get SMS logs
apiRouter.get('/sms/logs', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, ['sms.rules.view', 'sms.rules.create', 'sms.rules.edit'])) {
    return res.status(403).json({ error: 'دسترسی غیرمجاز به لاگ پیامک‌ها.' });
  }

  const logs = db.prepare('SELECT * FROM sms_logs ORDER BY sentAt DESC LIMIT 100').all() as any[];
  res.json({ logs });
});

// Dedicated Interactive SMS Diagnostic & Test Endpoint
apiRouter.post('/sms/test-direct', async (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'ابتدا وارد سامانه شوید.' });
  }

  const { provider, apiKey, senderNumber, phone, message, method } = req.body;

  if (!phone || !phone.trim()) {
    return res.status(400).json({ error: 'شماره گیرنده الزامی است.' });
  }

  const cleanPhone = phone.trim();
  const cleanKey = (apiKey || '').trim();
  const cleanSender = (senderNumber || '').trim();
  const testMessage = (message || '').trim() || 'تست ارسال پیامک از سامانه شورای ارزیابی';

  let serverOutboundIp = 'نامشخص';
  try {
    const ipRes = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(2000) }).then((r) => r.json());
    if (ipRes?.ip) serverOutboundIp = ipRes.ip;
  } catch (e) {}

  const diagnostics: Record<string, any> = {
    provider: provider || 'ghasedak',
    phone: cleanPhone,
    senderNumber: cleanSender,
    hasApiKey: Boolean(cleanKey),
    apiKeyLength: cleanKey.length,
    serverOutboundIp,
    requestedAt: new Date().toISOString(),
  };

  try {
    if (provider === 'ghasedak') {
      const results: any[] = [];

      // ۱. ارسال تکی به یک نفر: api.ghasedaksms.com/v2/sms/send/simple
      if (!method || method === 'simple' || method === 'all') {
        try {
          const paramsSimple: Record<string, string> = {
            message: testMessage,
            receptor: cleanPhone.split(/[,;\s]+/)[0] || cleanPhone,
          };
          if (cleanSender && cleanSender !== '10008585' && cleanSender !== 'default') {
            paramsSimple.linenumber = cleanSender;
            paramsSimple.sender = cleanSender;
          }

          const startSimple = Date.now();
          const resSimple = await fetch('https://api.ghasedaksms.com/v2/sms/send/simple', {
            method: 'POST',
            headers: {
              'apikey': cleanKey,
              'Content-Type': 'application/x-www-form-urlencoded',
              'cache-control': 'no-cache',
            },
            body: new URLSearchParams(paramsSimple).toString(),
          });
          const timeSimple = Date.now() - startSimple;
          const textSimple = await resSimple.text();
          let jsonSimple = null;
          try { jsonSimple = JSON.parse(textSimple); } catch (e) {}

          results.push({
            endpoint: 'https://api.ghasedaksms.com/v2/sms/send/simple',
            name: '۱. ارسال تکی به یک نفر (send/simple)',
            status: resSimple.status,
            statusText: resSimple.statusText,
            durationMs: timeSimple,
            headersSent: {
              'apikey': cleanKey ? `${cleanKey.slice(0, 4)}...${cleanKey.slice(-4)}` : '(none)',
              'Content-Type': 'application/x-www-form-urlencoded',
              'cache-control': 'no-cache',
            },
            payloadSent: paramsSimple,
            responseBody: jsonSimple || textSimple,
            isSuccess: resSimple.ok && (jsonSimple?.result?.code === 200 || jsonSimple?.result?.code === 201 || jsonSimple?.code === 200 || jsonSimple?.isSuccess === true),
          });
        } catch (err: any) {
          results.push({
            endpoint: 'https://api.ghasedaksms.com/v2/sms/send/simple',
            name: '۱. ارسال تکی به یک نفر (send/simple)',
            error: err.message,
          });
        }
      }

      // ۲. ارسال گروهی: api.ghasedaksms.com/v2/sms/send/bulk2
      if (!method || method === 'bulk2' || method === 'all') {
        try {
          const paramsBulk2: Record<string, string> = {
            message: testMessage,
            receptor: cleanPhone,
          };
          if (cleanSender && cleanSender !== '10008585' && cleanSender !== 'default') {
            paramsBulk2.sender = cleanSender;
            paramsBulk2.linenumber = cleanSender;
          }

          const startB2 = Date.now();
          const resB2 = await fetch('https://api.ghasedaksms.com/v2/sms/send/bulk2', {
            method: 'POST',
            headers: {
              'apikey': cleanKey,
              'Content-Type': 'application/x-www-form-urlencoded',
              'cache-control': 'no-cache',
            },
            body: new URLSearchParams(paramsBulk2).toString(),
          });
          const timeB2 = Date.now() - startB2;
          const textB2 = await resB2.text();
          let jsonB2 = null;
          try { jsonB2 = JSON.parse(textB2); } catch (e) {}

          results.push({
            endpoint: 'https://api.ghasedaksms.com/v2/sms/send/bulk2',
            name: '۲. ارسال گروهی (send/bulk2)',
            status: resB2.status,
            statusText: resB2.statusText,
            durationMs: timeB2,
            headersSent: {
              'apikey': cleanKey ? `${cleanKey.slice(0, 4)}...${cleanKey.slice(-4)}` : '(none)',
              'Content-Type': 'application/x-www-form-urlencoded',
              'cache-control': 'no-cache',
            },
            payloadSent: paramsBulk2,
            responseBody: jsonB2 || textB2,
            isSuccess: resB2.ok && (jsonB2?.result?.code === 200 || jsonB2?.result?.code === 201 || jsonB2?.code === 200 || jsonB2?.isSuccess === true),
          });
        } catch (err: any) {
          results.push({
            endpoint: 'https://api.ghasedaksms.com/v2/sms/send/bulk2',
            name: '۲. ارسال گروهی (send/bulk2)',
            error: err.message,
          });
        }
      }

      return res.json({
        provider: 'ghasedak',
        diagnostics,
        attempts: results,
        overallSuccess: results.some(r => r.isSuccess),
      });
    }

    // Fallback standard provider
    const settings: Record<string, string> = {
      sms_provider: provider || 'ghasedak',
      sms_api_key: cleanKey,
      sms_sender_number: cleanSender,
    };
    const standardResult = await sendSmsViaProvider(cleanPhone, testMessage, settings);
    return res.json({
      provider,
      diagnostics,
      standardResult,
      overallSuccess: standardResult.success,
    });
  } catch (globalErr: any) {
    return res.status(500).json({
      error: globalErr.message,
      diagnostics,
    });
  }
});


