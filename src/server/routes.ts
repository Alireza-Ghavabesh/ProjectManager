import express, { Request, Response } from 'express';
import { db, generateOfflineAvatarSvg } from './db.js';
import { randomUUID } from 'crypto';

export const apiRouter = express.Router();

// Helper to get authenticated user from request header or query
function getCurrentUser(req: Request) {
  const authHeader = req.headers.authorization;
  let userId = '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    userId = authHeader.substring(7).trim();
  } else if (req.query.userId && typeof req.query.userId === 'string') {
    userId = req.query.userId;
  }

  if (!userId) return null;

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
export function getUserPermissionsList(user: { id: string; role: string; positionId?: string | null }): string[] {
  if (user.role === 'ADMIN') {
    const allP = db.prepare('SELECT code FROM permissions').all() as { code: string }[];
    return allP.map((p) => p.code);
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

  // 3. User-specific custom permissions overrides
  try {
    const userP = db.prepare(`
      SELECT permissionCode FROM user_permissions
      WHERE userId = ?
    `).all(user.id) as { permissionCode: string }[];
    userP.forEach((p) => permSet.add(p.permissionCode));
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
  res.json({ token: user.id, user: fullUser });
});

apiRouter.get('/auth/me', (req: Request, res: Response) => {
  const user = getCurrentUser(req);
  if (!user) {
    return res.status(401).json({ error: 'کاربر احراز هویت نشده است.' });
  }
  res.json({ user });
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
  const user = db.prepare('SELECT id, name, username, role, positionId FROM users WHERE id = ?').get(userId) as any;
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

  const tx = db.transaction(() => {
    deleteStmt.run(userId);
    for (const code of permissions) {
      insertStmt.run(userId, code);
    }
  });

  tx();

  res.json({ success: true, count: permissions.length });
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
    SELECT s.*, p.title as positionTitle, p.color as positionColor
    FROM workflow_steps s
    JOIN positions p ON s.positionId = p.id
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
    INSERT INTO workflow_steps (id, workflowId, stepOrder, title, positionId, actionType, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    insertWf.run(id, title.trim(), description || '', now);
    steps.forEach((s: any, idx: number) => {
      insertStep.run(
        `st-${randomUUID().substring(0, 8)}`,
        id,
        idx + 1,
        s.title || `گام ${idx + 1}`,
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
      INSERT INTO workflow_steps (id, workflowId, stepOrder, title, positionId, actionType, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    steps.forEach((s: any, idx: number) => {
      insertStep.run(
        s.id && !s.id.startsWith('new-') ? s.id : `st-${randomUUID().substring(0, 8)}`,
        id,
        idx + 1,
        s.title || `گام ${idx + 1}`,
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
        requirements,
        attachments: prjAttachments,
        attachmentCount: prjAttachments.length,
        majorityResult: majorityInfo.majority,
        voteCounts: majorityInfo.counts,
        totalCouncilMembers: totalCouncilCount,
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
        requirements,
        attachments: prjAttachments,
        attachmentCount: prjAttachments.length,
        majorityResult: majorityInfo.majority,
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

  const { title, code, description, productionType, location, deadline, budgetEstimated, requirements } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'نام پروژه الزامی است.' });
  }

  const id = `prj-${Date.now()}`;
  const prjCode = code && code.trim() ? code.trim() : `PRJ-${Math.floor(1000 + Math.random() * 9000)}`;
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO projects (
        id, title, code, description, productionType, location, deadline, budgetEstimated,
        status, majorityResult, requirementsJson, createdById, workflowId, currentStepOrder, currentPositionId, createdAt, updatedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'IN_REVIEW', 'PENDING', ?, ?, NULL, 1, NULL, ?, ?)
    `).run(
      id,
      title.trim(),
      prjCode,
      description || '',
      productionType || 'طرح عمومی شورا',
      location || '',
      deadline || '',
      budgetEstimated || '',
      JSON.stringify(requirements || {}),
      currentUser.id,
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
  const { title, code, description, productionType, location, deadline, budgetEstimated, requirements, status } = req.body;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE projects
    SET title = ?, code = ?, description = ?, productionType = ?, location = ?,
        deadline = ?, budgetEstimated = ?, requirementsJson = ?, status = COALESCE(?, status), updatedAt = ?
    WHERE id = ?
  `).run(
    title,
    code,
    description || '',
    productionType || '',
    location || '',
    deadline || '',
    budgetEstimated || '',
    JSON.stringify(requirements || {}),
    status || null,
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

// Direct Download endpoint
apiRouter.get('/attachments/:id/download', (req: Request, res: Response) => {
  const { id } = req.params;
  const att = db.prepare('SELECT * FROM project_attachments WHERE id = ?').get(id) as any;
  if (!att) {
    return res.status(404).json({ error: 'فایل پیوست یافت نشد.' });
  }

  let buffer: Buffer;
  let mimeType = att.fileType || 'application/octet-stream';

  try {
    if (att.data.startsWith('data:')) {
      const match = att.data.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1] || mimeType;
        buffer = Buffer.from(match[2], 'base64');
      } else {
        const parts = att.data.split(',');
        buffer = Buffer.from(parts[1] || parts[0], 'base64');
      }
    } else {
      buffer = Buffer.from(att.data, 'base64');
    }

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(att.fileName)}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: 'خطا در بارگیری فایل.' });
  }
});

// Upload a new attachment to a project (Admin or project editors)
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
      typeof fileSize === 'number' ? fileSize : parseInt(fileSize, 10) || 0,
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
    db.prepare('DELETE FROM project_attachments WHERE id = ?').run(attachmentId);

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

  const project = db.prepare('SELECT id, title FROM projects WHERE id = ?').get(projectId);
  if (!project) {
    return res.status(404).json({ error: 'پروژه مورد نظر یافت نشد.' });
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
