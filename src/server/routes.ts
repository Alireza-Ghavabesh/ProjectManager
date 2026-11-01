import express, { Request, Response } from 'express';
import { db } from './db.js';
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

  // Resolve user permissions (ADMIN has all, or pull from position_permissions)
  let permissions: string[] = [];
  if (user.role === 'ADMIN') {
    const allP = db.prepare('SELECT code FROM permissions').all() as { code: string }[];
    permissions = allP.map((p) => p.code);
  } else if (user.positionId) {
    const posP = db.prepare(`
      SELECT permissionCode FROM position_permissions
      WHERE positionId = ?
    `).all(user.positionId) as { permissionCode: string }[];
    permissions = posP.map((p) => p.permissionCode);
  }

  return { ...user, permissions };
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

  let permissions: string[] = [];
  if (user.role === 'ADMIN') {
    const allP = db.prepare('SELECT code FROM permissions').all() as { code: string }[];
    permissions = allP.map((p) => p.code);
  } else if (user.positionId) {
    const posP = db.prepare(`
      SELECT permissionCode FROM position_permissions
      WHERE positionId = ?
    `).all(user.positionId) as { permissionCode: string }[];
    permissions = posP.map((p) => p.permissionCode);
  }

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

  // Attach permissions for each user
  const result = users.map((u) => {
    let permissions: string[] = [];
    if (u.role === 'ADMIN') {
      const allP = db.prepare('SELECT code FROM permissions').all() as { code: string }[];
      permissions = allP.map((p) => p.code);
    } else if (u.positionId) {
      const posP = db.prepare(`
        SELECT permissionCode FROM position_permissions
        WHERE positionId = ?
      `).all(u.positionId) as { permissionCode: string }[];
      permissions = posP.map((p) => p.permissionCode);
    }
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
  const avatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=0284c7,1e293b,6366f1`;

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

  const { title, code, description, productionType, location, deadline, budgetEstimated, requirements, workflowId } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'نام پروژه الزامی است.' });
  }

  const id = `prj-${Date.now()}`;
  const prjCode = code && code.trim() ? code.trim() : `PRJ-${Math.floor(1000 + Math.random() * 9000)}`;
  const now = new Date().toISOString();

  // Find first position of workflow
  const targetWfId = workflowId || 'wf-standard';
  const firstStep = db.prepare('SELECT positionId FROM workflow_steps WHERE workflowId = ? ORDER BY stepOrder ASC LIMIT 1').get(targetWfId) as any;
  const firstPosId = firstStep?.positionId || null;

  try {
    db.prepare(`
      INSERT INTO projects (
        id, title, code, description, productionType, location, deadline, budgetEstimated,
        status, majorityResult, requirementsJson, createdById, workflowId, currentStepOrder, currentPositionId, createdAt, updatedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'IN_REVIEW', 'PENDING', ?, ?, ?, 1, ?, ?, ?)
    `).run(
      id,
      title.trim(),
      prjCode,
      description || '',
      productionType || 'تولید تلویزیونی',
      location || '',
      deadline || '',
      budgetEstimated || '',
      JSON.stringify(requirements || {}),
      currentUser.id,
      targetWfId,
      firstPosId,
      now,
      now
    );

    // Initial log
    db.prepare(`
      INSERT INTO workflow_logs (id, projectId, stepOrder, fromUserId, toPositionId, action, comment, createdAt)
      VALUES (?, ?, 1, ?, ?, 'SUBMITTED', 'پروژه در سیستم ثبت و گردش کار آغاز گردید.', ?)
    `).run(`log-${randomUUID().substring(0, 8)}`, id, currentUser.id, firstPosId, now);

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
  db.prepare('DELETE FROM votes WHERE projectId = ?').run(id);
  db.prepare('DELETE FROM messages WHERE projectId = ?').run(id);
  db.prepare('DELETE FROM workflow_logs WHERE projectId = ?').run(id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  res.json({ success: true });
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
