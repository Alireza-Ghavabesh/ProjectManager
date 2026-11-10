import express, { Request, Response } from 'express';
import { db, generateOfflineAvatarSvg } from './db.js';
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

// Unified helper to get all effective permissions for a user
export function getUserPermissionsList(user: { id: string; role: string; positionId?: string | null; hasCustomPermissions?: number | boolean }): string[] {
  if (user.role === 'ADMIN') {
    const allP = db.prepare('SELECT code FROM permissions').all() as { code: string }[];
    return allP.map((p) => p.code);
  }

  // Check if user has explicit custom permissions configured
  let isCustom = Boolean(user.hasCustomPermissions);
  if (user.hasCustomPermissions === undefined) {
    try {
      const row = db.prepare('SELECT hasCustomPermissions FROM users WHERE id = ?').get(user.id) as any;
      isCustom = Boolean(row?.hasCustomPermissions);
    } catch (e) {}
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

  const permSet = new Set<string>();

  // 1. Direct primary position permissions
  if (user.positionId) {
    const posP = db.prepare(`
      SELECT permissionCode FROM position_permissions
      WHERE positionId = ?
    `).all(user.positionId) as { permissionCode: string }[];
    posP.forEach((p) => permSet.add(p.permissionCode));
  }

  // 2. Permissions from positions held in any project structure
  try {
    const structPosP = db.prepare(`
      SELECT pp.permissionCode
      FROM structure_position_users spu
      JOIN structure_positions sp ON spu.structurePositionId = sp.id
      JOIN position_permissions pp ON sp.positionId = pp.positionId
      WHERE spu.userId = ?
    `).all(user.id) as { permissionCode: string }[];
    structPosP.forEach((p) => permSet.add(p.permissionCode));
  } catch (e) {}

  return Array.from(permSet);
}

// Check permission helper
function hasPermission(user: any, permissionCode: string): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  return Array.isArray(user.permissions) && user.permissions.includes(permissionCode);
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

    // Trigger SMS notification to user if rule or phone exists
    triggerSmsForEvent({
      eventType: 'PASSWORD_RESET',
      targetUserId: currentReq.userId,
      actor: currentUser,
      extraData: {
        new_password: cleanPass,
        username: currentReq.username,
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
    SELECT p.*, parent.title as parentTitle,
           (SELECT COUNT(*) FROM users u WHERE u.positionId = p.id) as userCount
    FROM positions p
    LEFT JOIN positions parent ON p.parentId = parent.id
    ORDER BY p.level ASC, p.orderIndex ASC, p.title ASC
  `).all() as any[];

  // Attach users and permissions to each position
  const allUsers = db.prepare(`
    SELECT id, name, username, role, positionId, avatar
    FROM users
  `).all() as any[];

  const allPerms = db.prepare(`
    SELECT positionId, permissionCode FROM position_permissions
  `).all() as any[];

  const enriched = positions.map((pos) => {
    const posUsers = allUsers.filter((u) => u.positionId === pos.id);
    const posPerms = allPerms.filter((p) => p.positionId === pos.id).map((p) => p.permissionCode);
    return {
      ...pos,
      users: posUsers,
      permissions: posPerms,
    };
  });

  res.json({ positions: enriched });
});

apiRouter.post('/positions', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'org.positions.manage')) {
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
  if (!currentUser || !hasPermission(currentUser, 'org.positions.manage')) {
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
  if (!currentUser || !hasPermission(currentUser, 'org.positions.manage')) {
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

apiRouter.get('/workflows', (_req: Request, res: Response) => {
  const workflows = db.prepare('SELECT * FROM workflows ORDER BY isDefault DESC, title ASC').all() as any[];
  const steps = db.prepare(`
    SELECT s.*, p.title as positionTitle, p.color as positionColor, ps.title as structureTitle
    FROM workflow_steps s
    JOIN positions p ON s.positionId = p.id
    LEFT JOIN project_structures ps ON s.structureId = ps.id
    ORDER BY s.workflowId ASC, s.stepOrder ASC
  `).all() as any[];

  const result = workflows.map((wf) => {
    const wfSteps = steps.filter((s) => s.workflowId === wf.id);
    return {
      ...wf,
      steps: wfSteps,
    };
  });

  res.json({ workflows: result });
});

apiRouter.post('/workflows', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'workflow.definitions.manage')) {
    return res.status(403).json({ error: 'شما مجاز به طراحی و تعریف فرآیند گردش کار نیستید.' });
  }

  const { title, description, steps } = req.body;
  if (!title || !title.trim() || !Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ error: 'عنوان گردش کار و حداقل یک مرحله الزامی است.' });
  }

  const id = `wf-${randomUUID().substring(0, 8)}`;
  const now = new Date().toISOString();

  const insertWf = db.prepare('INSERT INTO workflows (id, title, description, isDefault, createdAt) VALUES (?, ?, ?, 0, ?)');
  const insertStep = db.prepare(`
    INSERT INTO workflow_steps (id, workflowId, stepOrder, title, structureId, positionId, actionType, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    insertWf.run(id, title.trim(), description || '', now);
    steps.forEach((s: any, idx: number) => {
      insertStep.run(
        `st-${randomUUID().substring(0, 8)}`,
        id,
        idx + 1,
        s.title || `گام ${idx + 1}`,
        s.structureId || null,
        s.positionId,
        s.actionType || 'REVIEW',
        s.description || ''
      );
    });
  });

  tx();

  res.json({ success: true, workflowId: id });
});

apiRouter.put('/workflows/:id', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'workflow.definitions.manage')) {
    return res.status(403).json({ error: 'شما مجاز به ویرایش فرآیند گردش کار نیستید.' });
  }

  const { id } = req.params;
  const { title, description, isDefault, steps } = req.body;
  if (!title || !title.trim() || !Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ error: 'عنوان گردش کار و حداقل یک مرحله الزامی است.' });
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE workflows SET title = ?, description = ?, isDefault = ? WHERE id = ?')
      .run(title.trim(), description || '', isDefault ? 1 : 0, id);

    db.prepare('DELETE FROM workflow_steps WHERE workflowId = ?').run(id);

    const insertStep = db.prepare(`
      INSERT INTO workflow_steps (id, workflowId, stepOrder, title, structureId, positionId, actionType, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    steps.forEach((s: any, idx: number) => {
      insertStep.run(
        s.id && !s.id.startsWith('new-') ? s.id : `st-${randomUUID().substring(0, 8)}`,
        id,
        idx + 1,
        s.title || `گام ${idx + 1}`,
        s.structureId || null,
        s.positionId,
        s.actionType || 'REVIEW',
        s.description || ''
      );
    });
  });

  tx();

  res.json({ success: true });
});

apiRouter.delete('/workflows/:id', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'workflow.definitions.manage')) {
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
  if (!currentUser || !hasPermission(currentUser, 'workflow.definitions.manage')) {
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
  const { action, comment, nextStepOrder, nextPositionId } = req.body;

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
  if (!project) {
    return res.status(404).json({ error: 'پروژه یافت نشد.' });
  }

  const now = new Date().toISOString();
  const logId = `log-${randomUUID().substring(0, 8)}`;

  // Find steps for project workflow
  const steps = db.prepare(`
    SELECT * FROM workflow_steps
    WHERE workflowId = ?
    ORDER BY stepOrder ASC
  `).all(project.workflowId || 'wf-standard') as any[];

  let targetStepOrder = project.currentStepOrder;
  let targetPositionId = project.currentPositionId;
  let newStatus = project.status;

  if (action === 'FORWARD' || action === 'APPROVED') {
    // Next step
    if (nextStepOrder) {
      targetStepOrder = nextStepOrder;
    } else {
      targetStepOrder = Math.min(steps.length, project.currentStepOrder + 1);
    }
    const targetStep = steps.find((s) => s.stepOrder === targetStepOrder);
    targetPositionId = nextPositionId || (targetStep ? targetStep.positionId : project.currentPositionId);

    // If reached end of workflow
    if (targetStepOrder === steps.length && project.currentStepOrder === steps.length) {
      newStatus = 'APPROVED';
    }
  } else if (action === 'NEEDS_REVISION') {
    newStatus = 'NEEDS_REVISION';
    // Send back to previous step or step 1
    targetStepOrder = Math.max(1, project.currentStepOrder - 1);
    const targetStep = steps.find((s) => s.stepOrder === targetStepOrder);
    targetPositionId = targetStep ? targetStep.positionId : project.currentPositionId;
  } else if (action === 'REJECTED') {
    newStatus = 'REJECTED';
  }

  db.prepare(`
    INSERT INTO workflow_logs (id, projectId, stepOrder, fromUserId, toPositionId, action, comment, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    logId,
    projectId,
    project.currentStepOrder,
    currentUser.id,
    targetPositionId,
    action,
    comment || '',
    now
  );

  db.prepare(`
    UPDATE projects
    SET currentStepOrder = ?, currentPositionId = ?, status = ?, updatedAt = ?
    WHERE id = ?
  `).run(targetStepOrder, targetPositionId, newStatus, now, projectId);

  // Send group notification to chat
  const actionText = action === 'FORWARD' ? 'تایید و ارجاع به مرحله بعد' : action === 'NEEDS_REVISION' ? 'درخواست اصلاح و ارجاع به گام قبل' : action === 'REJECTED' ? 'رد طرح در گردش کار' : 'تایید نهایی';
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
    currentStepOrder: targetStepOrder,
    currentPositionId: targetPositionId,
    status: newStatus,
  });
});

apiRouter.get('/projects/:id/workflow-logs', (req: Request, res: Response) => {
  const { id } = req.params;
  const logs = db.prepare(`
    SELECT l.*, u.name as fromUserName, pos.title as toPositionTitle, uPos.title as fromUserPosition
    FROM workflow_logs l
    JOIN users u ON l.fromUserId = u.id
    LEFT JOIN positions uPos ON u.positionId = uPos.id
    LEFT JOIN positions pos ON l.toPositionId = pos.id
    WHERE l.projectId = ?
    ORDER BY l.createdAt ASC
  `).all(id);

  res.json({ logs });
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
  if (!currentUser || (!hasPermission(currentUser, 'system.structures.manage') && !hasPermission(currentUser, 'projects.fields.manage'))) {
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
  if (!currentUser || (!hasPermission(currentUser, 'system.structures.manage') && !hasPermission(currentUser, 'projects.fields.manage'))) {
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
  if (!currentUser || (!hasPermission(currentUser, 'system.structures.manage') && !hasPermission(currentUser, 'projects.fields.manage'))) {
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
  if (!currentUser || (!hasPermission(currentUser, 'system.structures.manage') && !hasPermission(currentUser, 'org.positions.manage'))) {
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

// Update a position node in a structure (change parent, update position details)
apiRouter.put('/project-structures/:id/positions/:spId', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || (!hasPermission(currentUser, 'system.structures.manage') && !hasPermission(currentUser, 'org.positions.manage'))) {
    return res.status(403).json({ error: 'شما مجاز به ویرایش سمت در ساختار نیستید.' });
  }

  const { id: structureId, spId } = req.params;
  const { parentId, orderIndex, title, description, color } = req.body;

  const currentSP = db.prepare('SELECT * FROM structure_positions WHERE id = ? AND structureId = ?').get(spId, structureId) as any;
  if (!currentSP) {
    return res.status(404).json({ error: 'گره سمت در این ساختار یافت نشد.' });
  }

  if (parentId === spId) {
    return res.status(400).json({ error: 'یک سمت نمی‌تواند والد خودش باشد.' });
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
  if (!currentUser || (!hasPermission(currentUser, 'system.structures.manage') && !hasPermission(currentUser, 'org.positions.manage'))) {
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
  if (!currentUser || (!hasPermission(currentUser, 'system.structures.manage') && !hasPermission(currentUser, 'org.positions.assign'))) {
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
  if (!currentUser || (!hasPermission(currentUser, 'system.structures.manage') && !hasPermission(currentUser, 'org.positions.assign'))) {
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
    SELECT * FROM dynamic_fields
    WHERE isActive = 1
    ORDER BY orderIndex ASC, name ASC
  `).all();
  res.json({ fields });
});

apiRouter.post('/dynamic-fields', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  // STRICT REQUIREMENT: "هرکسی نتونه نیاز پروژه تعریف کنه"
  if (!currentUser || !hasPermission(currentUser, 'projects.fields.manage')) {
    return res.status(403).json({
      error: 'عدم دسترسی: شما مجوز تعریف یا تغییر فیلدهای نیاز پروژه را ندارید. این دسترسی مخصوص مدیران تعیین‌شده در ساختار دسترسی است.',
    });
  }

  const { name, key, fieldType, unit, defaultValue, required, category, icon } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'نام فیلد الزامی است.' });
  }

  const safeKey = (key && key.trim()) 
    ? key.trim().toLowerCase().replace(/\s+/g, '_')
    : `field_${Date.now()}`;

  const id = `fld-${randomUUID().substring(0, 8)}`;
  const maxOrder = db.prepare('SELECT MAX(orderIndex) as maxO FROM dynamic_fields').get() as any;
  const nextOrder = (maxOrder?.maxO || 0) + 1;

  try {
    db.prepare(`
      INSERT INTO dynamic_fields (id, name, key, fieldType, unit, defaultValue, optionsJson, required, orderIndex, isActive, icon, category, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, '[]', ?, ?, 1, ?, ?, ?)
    `).run(
      id,
      name.trim(),
      safeKey,
      fieldType || 'number',
      unit || 'نفر',
      defaultValue || '1',
      required ? 1 : 0,
      nextOrder,
      icon || 'Users',
      category || 'عوامل تولید',
      new Date().toISOString()
    );

    const created = db.prepare('SELECT * FROM dynamic_fields WHERE id = ?').get(id);
    res.json({ success: true, field: created });
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'کلید شناسایی فیلد تکراری است.' });
    }
    res.status(500).json({ error: 'خطا در ثبت فیلد پویای پروژه.' });
  }
});

apiRouter.delete('/dynamic-fields/:id', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'projects.fields.manage')) {
    return res.status(403).json({ error: 'عدم دسترسی: شما مجاز به حذف فیلدهای پروژه نیستید.' });
  }
  const { id } = req.params;
  db.prepare('DELETE FROM dynamic_fields WHERE id = ?').run(id);
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

  const projects = db.prepare(`
    SELECT p.*, u.name as creatorName, w.title as workflowTitle,
           pos.title as currentPositionTitle, pos.color as currentPositionColor
    FROM projects p
    LEFT JOIN users u ON p.createdById = u.id
    LEFT JOIN workflows w ON p.workflowId = w.id
    LEFT JOIN positions pos ON p.currentPositionId = pos.id
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

  // Pre-fetch workflow steps and logs
  const allSteps = db.prepare(`
    SELECT s.*, p.title as positionTitle, p.color as positionColor
    FROM workflow_steps s
    JOIN positions p ON s.positionId = p.id
    ORDER BY s.stepOrder ASC
  `).all() as any[];

  const allLogs = db.prepare(`
    SELECT l.*, u.name as fromUserName, pos.title as toPositionTitle, uPos.title as fromUserPosition
    FROM workflow_logs l
    JOIN users u ON l.fromUserId = u.id
    LEFT JOIN positions uPos ON u.positionId = uPos.id
    LEFT JOIN positions pos ON l.toPositionId = pos.id
    ORDER BY l.createdAt ASC
  `).all() as any[];

  const canViewConfidential = hasPermission(currentUser, 'voting.confidential.view_all');

  const result = projects.map((prj) => {
    let requirements = {};
    try {
      requirements = JSON.parse(prj.requirementsJson || '{}');
    } catch (e) {
      requirements = {};
    }

    const majorityInfo = calculateMajorityForProject(prj.id);
    const prjSteps = allSteps.filter((s) => s.workflowId === (prj.workflowId || 'wf-standard'));
    const prjLogs = allLogs.filter((l) => l.projectId === prj.id);
    const prjAttachments = allAttachments.filter((a) => a.projectId === prj.id);

    // Dynamic expected voters: count of positions/steps in this project's specific workflow
    const workflowStepCount = prjSteps.length;
    const projectExpectedVoters = workflowStepCount > 0 ? workflowStepCount : (totalCouncilCount || 4);
    const expired = isDeadlineExpired(prj.deadline);

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
        deliveryDate: prj.deliveryDate || '',
        isDeadlineExpired: expired,
        requirements,
        attachments: prjAttachments,
        attachmentCount: prjAttachments.length,
        majorityResult: majorityInfo.majority,
        voteCounts: majorityInfo.counts,
        totalCouncilMembers: projectExpectedVoters,
        allVotes,
        workflowSteps: prjSteps,
        workflowLogs: prjLogs,
      };
    } else {
      // Standard Council Member (CONFIDENTIALITY ENFORCED)
      const myVote = db.prepare(`
        SELECT v.id, v.status, v.reason, v.votedAt
        FROM votes v
        WHERE v.projectId = ? AND v.userId = ?
      `).get(prj.id, currentUser.id);

      return {
        ...prj,
        deliveryDate: prj.deliveryDate || '',
        isDeadlineExpired: expired,
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

  res.json({ projects: result });
});

apiRouter.post('/projects', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'projects.create')) {
    return res.status(403).json({ error: 'شما مجاز به ایجاد پروژه جدید نیستید.' });
  }

  const { title, code, description, productionType, location, deadline, deliveryDate, budgetEstimated, requirements, workflowId } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'نام پروژه الزامی است.' });
  }

  const id = `prj-${Date.now()}`;
  const prjCode = code && code.trim() ? code.trim() : `PRJ-${Math.floor(1000 + Math.random() * 9000)}`;
  const now = new Date().toISOString();

  // Resolve target workflow: specified or default workflow in database
  let targetWorkflowId = workflowId;
  if (!targetWorkflowId) {
    const defaultWf = db.prepare('SELECT id FROM workflows WHERE isDefault = 1 LIMIT 1').get() as any;
    targetWorkflowId = defaultWf?.id || 'wf-standard';
  }

  // Find first step position of this workflow
  const firstStep = db.prepare('SELECT positionId FROM workflow_steps WHERE workflowId = ? ORDER BY stepOrder ASC LIMIT 1').get(targetWorkflowId) as any;
  const initialPositionId = firstStep?.positionId || null;

  try {
    db.prepare(`
      INSERT INTO projects (
        id, title, code, description, productionType, location, deadline, deliveryDate, budgetEstimated,
        status, majorityResult, requirementsJson, createdById, workflowId, currentStepOrder, currentPositionId, createdAt, updatedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'IN_REVIEW', 'PENDING', ?, ?, ?, 1, ?, ?, ?)
    `).run(
      id,
      title.trim(),
      prjCode,
      description || '',
      productionType || 'طرح عمومی شورا',
      location || '',
      deadline || '',
      deliveryDate || '',
      budgetEstimated || '',
      JSON.stringify(requirements || {}),
      currentUser.id,
      targetWorkflowId,
      initialPositionId,
      now,
      now
    );

    // Broadcast notification to Council Chat
    db.prepare(`
      INSERT INTO messages (id, senderId, receiverId, isGroup, content, projectId, createdAt)
      VALUES (?, ?, NULL, 1, ?, ?, ?)
    `).run(
      `msg-${randomUUID().substring(0, 8)}`,
      currentUser.id,
      `طرح جدید «${title.trim()}» با کد ${prjCode} ثبت شد و در کارتابل ارزیابی تمامی اعضای شورا قرار گرفت.`,
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

    res.json({ success: true, projectId: id });
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
  const { title, code, description, productionType, location, deadline, deliveryDate, budgetEstimated, requirements, status, workflowId } = req.body;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE projects
    SET title = ?, code = ?, description = ?, productionType = ?, location = ?,
        deadline = ?, deliveryDate = ?, budgetEstimated = ?, requirementsJson = ?, status = COALESCE(?, status),
        workflowId = COALESCE(?, workflowId), updatedAt = ?
    WHERE id = ?
  `).run(
    title,
    code,
    description || '',
    productionType || '',
    location || '',
    deadline || '',
    deliveryDate || '',
    budgetEstimated || '',
    JSON.stringify(requirements || {}),
    status || null,
    workflowId || null,
    now,
    id
  );

  res.json({ success: true });
});

apiRouter.delete('/projects/:id', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || !hasPermission(currentUser, 'projects.delete')) {
    return res.status(403).json({ error: 'شما مجاز به حذف پروژه نیستید.' });
  }
  const { id } = req.params;
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
  if (!currentUser || (!hasPermission(currentUser, 'projects.edit') && !hasPermission(currentUser, 'projects.create'))) {
    return res.status(403).json({ error: 'عدم دسترسی: شما مجاز به پیوست فایل برای این پروژه نیستید.' });
  }

  const { id: projectId } = req.params;
  const project = db.prepare('SELECT id, title FROM projects WHERE id = ?').get(projectId) as any;
  if (!project) {
    return res.status(404).json({ error: 'پروژه مورد نظر یافت نشد.' });
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
  if (!currentUser || (!hasPermission(currentUser, 'projects.edit') && !hasPermission(currentUser, 'projects.create'))) {
    return res.status(403).json({ error: 'عدم دسترسی: شما مجاز به پیوست فایل برای این پروژه نیستید.' });
  }

  const { id: projectId } = req.params;
  const project = db.prepare('SELECT id, title FROM projects WHERE id = ?').get(projectId) as any;
  if (!project) {
    return res.status(404).json({ error: 'پروژه مورد نظر یافت نشد.' });
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
      db.prepare(`
        INSERT INTO messages (id, senderId, receiverId, isGroup, content, projectId, createdAt)
        VALUES (?, ?, NULL, 1, ?, ?, ?)
      `).run(
        `msg-${randomUUID().substring(0, 8)}`,
        currentUser.id,
        `فایل «${existing.fileName}» توسط ${currentUser.name} از پروژه «${project.title}» حذف گردید.`,
        projectId,
        new Date().toISOString()
      );
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

  const project = db.prepare('SELECT id, title, deadline FROM projects WHERE id = ?').get(projectId) as any;
  if (!project) {
    return res.status(404).json({ error: 'پروژه مورد نظر یافت نشد.' });
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
  if (currentUser.role === 'COUNCIL') {
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

  const list = db.prepare('SELECT key, value, description, updatedAt FROM system_settings').all() as any[];
  const settings: Record<string, string> = {};
  for (const item of list) {
    settings[item.key] = item.value;
  }

  res.json({ settings, list });
});

apiRouter.put('/settings', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || currentUser.role !== 'ADMIN') {
    return res.status(403).json({ error: 'دسترسی غیرمجاز: صرفاً مدیرکل (کاربر ارشد سیستم) مجاز به تغییر تنظیمات سامانه است.' });
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

// Upload login logo image (Admin only)
apiRouter.post('/system/upload-logo', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || currentUser.role !== 'ADMIN') {
    return res.status(403).json({ error: 'صرفاً کاربر ارشد سیستم مجاز به تغییر لوگو است.' });
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

// Create SMS rule (Admin only)
apiRouter.post('/sms/rules', (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || currentUser.role !== 'ADMIN') {
    return res.status(403).json({ error: 'صرفاً مدیرکل مجاز به تعریف شرط‌های پیامک است.' });
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
  if (!currentUser || currentUser.role !== 'ADMIN') {
    return res.status(403).json({ error: 'صرفاً مدیرکل مجاز به ویرایش شرط پیامک است.' });
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
  if (!currentUser || currentUser.role !== 'ADMIN') {
    return res.status(403).json({ error: 'دسترسی غیرمجاز.' });
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
  if (!currentUser || currentUser.role !== 'ADMIN') {
    return res.status(403).json({ error: 'صرفاً مدیرکل مجاز به حذف شرط پیامک است.' });
  }

  const { id } = req.params;
  db.prepare('DELETE FROM sms_rules WHERE id = ?').run(id);
  res.json({ success: true });
});

// Send test SMS
apiRouter.post('/sms/send-test', async (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser || currentUser.role !== 'ADMIN') {
    return res.status(403).json({ error: 'صرفاً مدیرکل مجاز به ارسال پیامک تستی است.' });
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
  if (!currentUser || currentUser.role !== 'ADMIN') {
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


