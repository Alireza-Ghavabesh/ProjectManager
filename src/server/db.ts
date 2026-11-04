import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Reliable root directory: council.db is always placed at project root regardless of PM2 working directory
const projectRoot = path.resolve(__dirname, '../../');
const dbPath = path.join(projectRoot, 'council.db');

const rawDb = new DatabaseSync(dbPath);
rawDb.exec('PRAGMA journal_mode = WAL;');
rawDb.exec('PRAGMA foreign_keys = ON;');

function normalizeArgs(args: any[]): any[] {
  const flatArgs = (args.length === 1 && Array.isArray(args[0])) ? args[0] : args;
  return flatArgs.map(val => {
    if (val === undefined) return null;
    if (typeof val === 'boolean') return val ? 1 : 0;
    return val;
  });
}

export interface StatementWrapper {
  run(...args: any[]): { lastInsertRowid: number | bigint; changes: number | bigint };
  get(...args: any[]): any;
  all(...args: any[]): any[];
}

export interface DatabaseWrapper {
  exec(sql: string): void;
  pragma(sql: string): void;
  prepare(sql: string): StatementWrapper;
  transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T;
}

const db: DatabaseWrapper = {
  exec(sql: string) {
    return rawDb.exec(sql);
  },
  pragma(str: string) {
    return rawDb.exec(`PRAGMA ${str};`);
  },
  prepare(sql: string): StatementWrapper {
    const stmt = rawDb.prepare(sql);
    return {
      run(...args: any[]) {
        return stmt.run(...normalizeArgs(args));
      },
      get(...args: any[]) {
        return stmt.get(...normalizeArgs(args));
      },
      all(...args: any[]) {
        return stmt.all(...normalizeArgs(args));
      },
    };
  },
  transaction<T>(fn: (...args: any[]) => T) {
    return (...args: any[]): T => {
      rawDb.exec('BEGIN');
      try {
        const res = fn(...args);
        rawDb.exec('COMMIT');
        return res;
      } catch (err) {
        rawDb.exec('ROLLBACK');
        throw err;
      }
    };
  },
};

export function generateOfflineAvatarSvg(name: string, seed: string): string {
  const initial = (name || '?').trim().charAt(0);
  const palettes = [
    ['#4f46e5', '#3730a3'], // Indigo
    ['#0284c7', '#0369a1'], // Sky
    ['#059669', '#047857'], // Emerald
    ['#d97706', '#b45309'], // Amber
    ['#7c3aed', '#6d28d9'], // Violet
    ['#e11d48', '#be123c'], // Rose
    ['#0891b2', '#0e7490'], // Cyan
  ];
  let hash = 0;
  for (let i = 0; i < (seed || name || 'x').length; i++) {
    hash = (hash << 5) - hash + (seed || name).charCodeAt(i);
    hash |= 0;
  }
  const [c1, c2] = palettes[Math.abs(hash) % palettes.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="80" height="80"><defs><linearGradient id="g_${Math.abs(hash)}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect width="80" height="80" rx="40" fill="url(#g_${Math.abs(hash)})"/><text x="40" y="47" font-family="system-ui, sans-serif" font-size="34" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${initial}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS positions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL UNIQUE,
      description TEXT,
      color TEXT DEFAULT 'indigo',
      parentId TEXT REFERENCES positions(id) ON DELETE SET NULL,
      level INTEGER DEFAULT 1,
      orderIndex INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'COUNCIL', -- 'ADMIN' or 'COUNCIL'
      positionId TEXT REFERENCES positions(id) ON DELETE SET NULL,
      avatar TEXT,
      phone TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dynamic_fields (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key TEXT UNIQUE NOT NULL,
      fieldType TEXT DEFAULT 'number', -- 'number', 'text', 'select'
      unit TEXT DEFAULT 'نفر',
      defaultValue TEXT DEFAULT '1',
      optionsJson TEXT DEFAULT '[]',
      required INTEGER DEFAULT 0,
      orderIndex INTEGER DEFAULT 0,
      isActive INTEGER DEFAULT 1,
      icon TEXT DEFAULT 'Users',
      category TEXT DEFAULT 'عوامل تولید',
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_structures (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL UNIQUE,
      code TEXT,
      description TEXT,
      category TEXT DEFAULT 'تولید تلویزیونی',
      defaultWorkflowId TEXT REFERENCES workflows(id) ON DELETE SET NULL,
      orderIndex INTEGER DEFAULT 0,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      isDefault INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workflow_steps (
      id TEXT PRIMARY KEY,
      workflowId TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      stepOrder INTEGER NOT NULL,
      title TEXT NOT NULL,
      structureId TEXT REFERENCES project_structures(id) ON DELETE SET NULL,
      positionId TEXT NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
      actionType TEXT DEFAULT 'REVIEW', -- 'REVIEW', 'TECHNICAL_APPROVE', 'BUDGET_APPROVE', 'CONTENT_APPROVE', 'FINAL_COUNCIL_VOTE'
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      description TEXT,
      productionType TEXT,
      location TEXT,
      deadline TEXT,
      budgetEstimated TEXT,
      status TEXT DEFAULT 'IN_REVIEW', -- 'IN_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_REVISION'
      majorityResult TEXT DEFAULT 'PENDING',
      requirementsJson TEXT DEFAULT '{}',
      createdById TEXT REFERENCES users(id) ON DELETE SET NULL,
      workflowId TEXT REFERENCES workflows(id) ON DELETE SET NULL,
      currentStepOrder INTEGER DEFAULT 1,
      currentPositionId TEXT REFERENCES positions(id) ON DELETE SET NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workflow_logs (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      stepOrder INTEGER NOT NULL,
      fromUserId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      toPositionId TEXT REFERENCES positions(id) ON DELETE SET NULL,
      action TEXT NOT NULL, -- 'FORWARDED', 'APPROVED', 'REJECTED', 'NEEDS_REVISION', 'FINAL_APPROVED'
      comment TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      parentCode TEXT,
      description TEXT,
      isDanger INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS position_permissions (
      positionId TEXT NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
      permissionCode TEXT NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
      PRIMARY KEY (positionId, permissionCode)
    );

    CREATE TABLE IF NOT EXISTS user_permissions (
      userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permissionCode TEXT NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
      PRIMARY KEY (userId, permissionCode)
    );

    CREATE TABLE IF NOT EXISTS structure_positions (
      id TEXT PRIMARY KEY,
      structureId TEXT NOT NULL REFERENCES project_structures(id) ON DELETE CASCADE,
      positionId TEXT NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
      parentId TEXT REFERENCES structure_positions(id) ON DELETE SET NULL,
      orderIndex INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS structure_position_users (
      structurePositionId TEXT NOT NULL REFERENCES structure_positions(id) ON DELETE CASCADE,
      userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (structurePositionId, userId)
    );

    CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL, -- 'APPROVED', 'REJECTED', 'NEEDS_REVISION'
      reason TEXT,
      votedAt TEXT NOT NULL,
      UNIQUE(projectId, userId)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      senderId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiverId TEXT REFERENCES users(id) ON DELETE CASCADE,
      isGroup INTEGER DEFAULT 0,
      content TEXT NOT NULL,
      projectId TEXT REFERENCES projects(id) ON DELETE SET NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_attachments (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      fileName TEXT NOT NULL,
      fileSize INTEGER NOT NULL,
      fileType TEXT,
      data TEXT NOT NULL,
      uploadedBy TEXT REFERENCES users(id) ON DELETE SET NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updatedAt TEXT NOT NULL
    );
  `);

  // Safe columns migration for positions if already existed
  try {
    db.prepare('ALTER TABLE positions ADD COLUMN parentId TEXT REFERENCES positions(id) ON DELETE SET NULL').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE positions ADD COLUMN level INTEGER DEFAULT 1').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE positions ADD COLUMN orderIndex INTEGER DEFAULT 0').run();
  } catch (e) {}

  // Safe columns migration for projects if already existed
  try {
    db.prepare('ALTER TABLE projects ADD COLUMN workflowId TEXT REFERENCES workflows(id) ON DELETE SET NULL').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE projects ADD COLUMN currentStepOrder INTEGER DEFAULT 1').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE projects ADD COLUMN currentPositionId TEXT REFERENCES positions(id) ON DELETE SET NULL').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE projects ADD COLUMN deliveryDate TEXT').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE workflow_steps ADD COLUMN structureId TEXT REFERENCES project_structures(id) ON DELETE SET NULL').run();
  } catch (e) {}

  seedInitialData();
}

function seedInitialData() {
  const now = new Date().toISOString();

  // 1. Seed Tree-structured Permissions
  const permCount = (db.prepare('SELECT count(*) as count FROM permissions').get() as any).count;
  if (permCount === 0) {
    const insertPerm = db.prepare(`
      INSERT INTO permissions (id, code, title, category, parentCode, description, isDanger)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const permissionsData = [
      // Root: System & Security
      ['p-1', 'system', 'مدیریت کل سیستم و امنیت', 'سیستم و امنیت', null, 'دسترسی ریشه به کل تنظیمات و ماژول‌ها', 1],
      ['p-2', 'system.users.view', 'مشاهده کاربران و پروفایل‌ها', 'کاربران', 'system', 'امکان مشاهده لیست پرسنل و مشخصات', 0],
      ['p-3', 'system.users.create', 'تعریف و ثبت کاربر جدید', 'کاربران', 'system', 'ثبت اعضای جدید با شناسه و رمز', 0],
      ['p-4', 'system.users.edit', 'ویرایش مشخصات کاربران', 'کاربران', 'system', 'تغییر نام، شماره و سمت پرسنل', 0],
      ['p-5', 'system.users.delete', 'حذف حساب کاربران', 'کاربران', 'system', 'حذف دسترسی کاربری', 1],
      ['p-6', 'system.users.assign_admin', 'اعطای نقش مدیر (ادمین) به کاربر', 'امنیت بالا', 'system', 'فقط مدیران ارشد مجاز به انتصاب ادمین هستند', 1],
      ['p-7', 'system.permissions.manage', 'تنظیم ماتریس سطح دسترسی‌ها', 'امنیت بالا', 'system', 'تخصیص مجوزهای درختی به سمت‌ها', 1],

      // Root: Org Structure
      ['p-8', 'org', 'چارت و ساختار سازمانی شورا', 'ساختار شورا', null, 'مدیریت کل چارت سازمانی و سطوح', 0],
      ['p-9', 'org.positions.view', 'مشاهده ساختار درختی سمت‌ها', 'ساختار شورا', 'org', 'دیدن گراف درختی سلسله مراتب', 0],
      ['p-10', 'org.positions.manage', 'ایجاد و ویرایش سمت‌ها و گره‌های چارت', 'ساختار شورا', 'org', 'تعریف رده‌های سازمانی و تغییر والد', 1],
      ['p-11', 'org.positions.assign', 'انتصاب کاربران به سمت‌های چارت', 'ساختار شورا', 'org', 'جابجایی سمت پرسنل شورا', 0],

      // Root: Dynamic Fields & Projects
      ['p-12', 'projects', 'پروژه‌ها و فیلدهای نیاز', 'پروژه‌ها', null, 'مدیریت طرح‌ها، فیلدها و مصوبات', 0],
      ['p-13', 'projects.fields.manage', 'تعریف و مدیریت فیلدهای پویای نیاز پروژه', 'فیلدهای پویا', 'projects', 'افزودن و حذف فیلدهای اختصاصی بدون تغییر کد', 1],
      ['p-28', 'system.structures.manage', 'تعریف انواع و ساختارهای پروژه', 'ساختارهای پروژه', 'projects', 'مدیریت پویا و بدون کدنویسی انواع ساختار تولید', 1],
      ['p-14', 'projects.create', 'ثبت و ارسال پروژه جدید به کارتابل', 'پروژه‌ها', 'projects', 'ایجاد طرح جدید و ارجاع به گردش کار', 0],
      ['p-15', 'projects.edit', 'ویرایش مشخصات و بودجه پروژه', 'پروژه‌ها', 'projects', 'تغییر عوامل و برآوردها', 0],
      ['p-16', 'projects.delete', 'حذف پروژه از شورا', 'پروژه‌ها', 'projects', 'حذف کامل پروژه از سیستم', 1],
      ['p-17', 'projects.finalize', 'تصویب نهایی و صدور ابلاغیه', 'مصوبات', 'projects', 'خاتمه گردش کار و صدور مصوبه رسمی', 1],

      // Root: Workflow
      ['p-18', 'workflow', 'گردش کار و فرآیند سازمانی', 'گردش کار', null, 'طراحی و اجرای گردش پروژه‌ها در چارت', 0],
      ['p-19', 'workflow.definitions.manage', 'تعریف و تغییر فرآیندهای گردش کار', 'گردش کار', 'workflow', 'تعریف گام‌های متوالی بر روی سمت‌ها', 1],
      ['p-20', 'workflow.forward', 'ارجاع و تایید در گردش کار سازمانی', 'گردش کار', 'workflow', 'انتقال پروژه به گام یا سمت بعدی چارت', 0],
      ['p-21', 'workflow.history.view', 'مشاهده تاریخچه کامل گردش کار', 'گردش کار', 'workflow', 'دیدن سوابق ارجاعات و امضاها', 0],

      // Root: Cartable & Confidential Voting
      ['p-22', 'voting', 'کارتابل و سیستم رای‌گیری', 'آرا و کارتابل', null, 'مدیریت نظرات و تصمیم‌گیری شورا', 0],
      ['p-23', 'voting.cast', 'ثبت رای تخصصی در کارتابل', 'آرا و کارتابل', 'voting', 'رای موافق، مخالف یا نیاز به اصلاح', 0],
      ['p-24', 'voting.confidential.view_all', 'مشاهده محرمانه تفصیلی آرای اعضا', 'نظارت شورا', 'voting', 'فقط مدیران جلسه مجاز به دیدن رای دیگران هستند', 1],

      // Root: Communication
      ['p-25', 'chat', 'ارتباطات و پیام‌رسانی', 'ارتباطات', null, 'گفتگوی گروهی و خصوصی اعضا', 0],
      ['p-26', 'chat.group.send', 'ارسال پیام در تالار عمومی شورا', 'ارتباطات', 'chat', 'تبادل نظر عمومی پیرامون پروژه‌ها', 0],
      ['p-27', 'chat.direct.send', 'گفتگوی خصوصی (پی‌وی) با اعضا', 'ارتباطات', 'chat', 'پیام محرمانه دو نفره با مدیر یا شورا', 0],
    ];

    for (const p of permissionsData) {
      insertPerm.run(...p);
    }
  }

  // 2. Seed Tree-structured Positions (چارت سازمانی درختی شورا)
  const existingPos = db.prepare('SELECT count(*) as count FROM positions').get() as { count: number };
  if (existingPos.count === 0) {
    const insertPos = db.prepare(`
      INSERT INTO positions (id, title, description, color, parentId, level, orderIndex, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Level 1: Root
    insertPos.run('pos-root', 'ریاست عالیه شورا و مدیرکل', 'راهبری کلان، تنفیذ مصوبات نهایی و نظارت عالیه', 'rose', null, 1, 1, now);

    // Level 2: Directors / Secretaries
    insertPos.run('pos-1', 'دبیر شورا و مدیر جلسه', 'مدیریت ثبت پروژه‌ها، هدایت جلسات و پیگیری گردش کار', 'indigo', 'pos-root', 2, 1, now);
    insertPos.run('pos-dept-prod', 'مدیریت گروه تولید و برنامه‌ریزی', 'هماهنگی امور اجرایی، صحنه، فنی و لجستیک تولید', 'cyan', 'pos-root', 2, 2, now);
    insertPos.run('pos-dept-eval', 'مدیریت نظارت، کیفی و برآورد', 'ارزیابی محتوایی، بودجه و تطبیق استانداردها', 'emerald', 'pos-root', 2, 3, now);

    // Level 3: Specialists under Production Dept
    insertPos.run('pos-3', 'مدیر فنی و تصویربرداری', 'ارزیابی تجهیزات، عوامل فنی و نیازهای استودیو', 'cyan', 'pos-dept-prod', 3, 1, now);
    insertPos.run('pos-4', 'مدیر تولید و هماهنگی صحنه', 'برنامه‌ریزی اجرایی، عوامل صحنه، لوکیشن و زمان‌بندی', 'purple', 'pos-dept-prod', 3, 2, now);

    // Level 3: Specialists under Evaluation Dept
    insertPos.run('pos-2', 'ناظر کیفی و محتوایی', 'بررسی فیلم‌نامه، چارچوب محتوایی و انطباق با سیاست‌ها', 'emerald', 'pos-dept-eval', 3, 1, now);
    insertPos.run('pos-5', 'کارشناس برآورد و مالی', 'کنترل بودجه، دستمزدها و هزینه‌های عوامل تولید', 'amber', 'pos-dept-eval', 3, 2, now);
  } else {
    // Ensure parent links exist if database was previously created flat
    try {
      db.prepare("UPDATE positions SET parentId = 'pos-1', level = 3 WHERE id IN ('pos-2', 'pos-3', 'pos-4', 'pos-5') AND parentId IS NULL").run();
      db.prepare("UPDATE positions SET level = 1 WHERE id = 'pos-1'").run();
    } catch (e) {}
  }

  // Assign permissions to positions
  const posPermCount = (db.prepare('SELECT count(*) as count FROM position_permissions').get() as any).count;
  if (posPermCount === 0) {
    const insertPosPerm = db.prepare('INSERT OR IGNORE INTO position_permissions (positionId, permissionCode) VALUES (?, ?)');
    
    // Admin position (pos-1 and pos-root) gets ALL permissions
    const allPerms = db.prepare('SELECT code FROM permissions').all() as { code: string }[];
    for (const p of allPerms) {
      insertPosPerm.run('pos-1', p.code);
      insertPosPerm.run('pos-root', p.code);
    }

    // Standard Council Positions get voting, chat, view, and workflow forward
    const councilPerms = [
      'system.users.view',
      'org.positions.view',
      'workflow.forward',
      'workflow.history.view',
      'voting.cast',
      'chat.group.send',
      'chat.direct.send',
    ];

    const councilPosIds = ['pos-2', 'pos-3', 'pos-4', 'pos-5', 'pos-dept-prod', 'pos-dept-eval'];
    for (const posId of councilPosIds) {
      for (const pCode of councilPerms) {
        insertPosPerm.run(posId, pCode);
      }
    }
  }

  // 3. Seed Users
  const userCount = (db.prepare('SELECT count(*) as count FROM users').get() as any).count;
  if (userCount === 0) {
    const insertUser = db.prepare(`
      INSERT INTO users (id, username, password, name, role, positionId, avatar, phone, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertUser.run('usr-admin', 'admin', 'admin123', 'مهندس علیرضا علوی', 'ADMIN', 'pos-1', generateOfflineAvatarSvg('مهندس علیرضا علوی', 'usr-admin'), '09121112233', now);
    insertUser.run('usr-rezaei', 'rezaei', '123456', 'دکتر فاطمه رضایی', 'COUNCIL', 'pos-2', generateOfflineAvatarSvg('دکتر فاطمه رضایی', 'usr-rezaei'), '09122223344', now);
    insertUser.run('usr-tehrani', 'tehrani', '123456', 'مهندس سهراب تهرانی', 'COUNCIL', 'pos-3', generateOfflineAvatarSvg('مهندس سهراب تهرانی', 'usr-tehrani'), '09123334455', now);
    insertUser.run('usr-moradi', 'moradi', '123456', 'پیمان مرادی', 'COUNCIL', 'pos-4', generateOfflineAvatarSvg('پیمان مرادی', 'usr-moradi'), '09124445566', now);
    insertUser.run('usr-hoseini', 'hoseini', '123456', 'مریم سادات حسینی', 'COUNCIL', 'pos-5', generateOfflineAvatarSvg('مریم سادات حسینی', 'usr-hoseini'), '09125556677', now);
  } else {
    // Ensure admin user always exists if somehow missing from an existing database
    const adminExists = db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as any;
    if (!adminExists) {
      db.prepare(`
        INSERT INTO users (id, username, password, name, role, positionId, avatar, phone, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('usr-admin', 'admin', 'admin123', 'مهندس علیرضا علوی', 'ADMIN', 'pos-1', generateOfflineAvatarSvg('مهندس علیرضا علوی', 'usr-admin'), '09121112233', now);
    }

    // Offline Migration: convert any external URLs in database to offline SVG data URIs
    const existingUsers = db.prepare("SELECT id, name, avatar FROM users WHERE avatar LIKE 'http%'").all() as any[];
    for (const u of existingUsers) {
      db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(
        generateOfflineAvatarSvg(u.name, u.id),
        u.id
      );
    }
  }

  // 4. Seed Dynamic Fields
  const fieldCount = (db.prepare('SELECT count(*) as count FROM dynamic_fields').get() as any).count;
  if (fieldCount === 0) {
    const insertField = db.prepare(`
      INSERT INTO dynamic_fields (id, name, key, fieldType, unit, defaultValue, optionsJson, required, orderIndex, isActive, icon, category, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, '[]', ?, ?, 1, ?, ?, ?)
    `);

    const fields = [
      ['fld-1', 'تعداد تصویربردار', 'cameraman_count', 'number', 'نفر', '2', 1, 1, 'Video', 'عوامل فنی و تصویر'],
      ['fld-2', 'تعداد کارگردان', 'director_count', 'number', 'نفر', '1', 1, 2, 'Clapperboard', 'تیم کارگردانی'],
      ['fld-3', 'تعداد تهیه کننده', 'producer_count', 'number', 'نفر', '1', 1, 3, 'Briefcase', 'تیم تهیه‌کنندگی'],
      ['fld-4', 'تعداد مجری', 'host_count', 'number', 'نفر', '1', 0, 4, 'Mic', 'عوامل مقابل دوربین'],
      ['fld-5', 'تعداد نورپرداز', 'lighting_count', 'number', 'نفر', '1', 0, 5, 'Sun', 'عوامل فنی و تصویر'],
      ['fld-6', 'تعداد صدابردار', 'sound_count', 'number', 'نفر', '1', 1, 6, 'Radio', 'عوامل صدا'],
      ['fld-7', 'تعداد ترابری', 'transport_count', 'number', 'دستگاه خودرو', '2', 0, 7, 'Truck', 'پشتیبانی و لجستیک'],
      ['fld-8', 'تعداد پشتیبانی', 'support_count', 'number', 'نفر', '2', 0, 8, 'ShieldCheck', 'پشتیبانی و لجستیک'],
      ['fld-9', 'تعداد تدوینگر', 'editor_count', 'number', 'نفر', '1', 1, 9, 'Scissors', 'پس‌تولید'],
      ['fld-10', 'تعداد عکاس', 'photographer_count', 'number', 'نفر', '1', 0, 10, 'Camera', 'رسانه و عکاسی'],
    ];

    for (const f of fields) {
      insertField.run(f[0], f[1], f[2], f[3], f[4], f[5], f[6], f[7], f[8], f[9], now);
    }
  }

  // 5. Seed Organizational Workflows (گردش کار مبتنی بر چارت سازمانی)
  const wfCount = (db.prepare('SELECT count(*) as count FROM workflows').get() as any).count;
  if (wfCount === 0) {
    db.prepare(`
      INSERT INTO workflows (id, title, description, isDefault, createdAt)
      VALUES ('wf-standard', 'گردش کار مصوب شورا (۴ مرحله‌ای سازمانی)', 'فرآیند جامع بررسی فنی، کیفی، برآورد مالی و تصویب نهایی در شورا', 1, ?)
    `).run(now);

    const insertStep = db.prepare(`
      INSERT INTO workflow_steps (id, workflowId, stepOrder, title, positionId, actionType, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertStep.run('st-1', 'wf-standard', 1, 'ارزیابی فنی و تجهیزات تصویر', 'pos-3', 'TECHNICAL_APPROVE', 'بررسی تعداد تصویربرداران، صدابردار، نورپرداز و امکانات فنی');
    insertStep.run('st-2', 'wf-standard', 2, 'بررسی محتوایی و فیلم‌نامه', 'pos-2', 'CONTENT_APPROVE', 'انطباق موضوع با سیاست‌های پخش و ارزیابی محتوایی');
    insertStep.run('st-3', 'wf-standard', 3, 'کنترل مالی و برآورد بودجه', 'pos-5', 'BUDGET_APPROVE', 'محاسبه دستمزدها، پشتیبانی، ترابری و تراز مالی طرح');
    insertStep.run('st-4', 'wf-standard', 4, 'رای‌گیری صحن شورا و صدور مصوبه نهایی', 'pos-1', 'FINAL_COUNCIL_VOTE', 'طرح در صحن شورا، محاسبه اکثریت آرا و صدور ابلاغیه قطعی');
  }

  // 6. Seed Organizational Structures (ساختارهای سازمانی مانند مرخصی، ماموریت، مالی، شورا)
  const isOldDramaStruct = db.prepare("SELECT count(*) as count FROM project_structures WHERE code = 'DRAMA_SERIES'").get() as { count: number };
  if (isOldDramaStruct.count > 0) {
    // Migrate to organizational structures
    db.prepare('DELETE FROM structure_position_users').run();
    db.prepare('DELETE FROM structure_positions').run();
    db.prepare('DELETE FROM project_structures').run();
  }

  // Ensure standard positions exist in library
  const insertPosIfMissing = db.prepare(`
    INSERT OR IGNORE INTO positions (id, title, description, color, parentId, level, orderIndex, createdAt)
    VALUES (?, ?, ?, ?, NULL, 1, 0, ?)
  `);

  insertPosIfMissing.run('pos-fin', 'مدیر امور مالی و بودجه', 'مسئول تایید و کنترل بودجه، تراکنش‌ها و هزینه‌ها در ساختارهای مختلف', 'amber', now);
  insertPosIfMissing.run('pos-admin-affairs', 'مدیر امور اداری و پرسنلی', 'رسیدگی به امور کارکنان، مرخصی‌ها، احکام و رفاهیات', 'blue', now);
  insertPosIfMissing.run('pos-mission-lead', 'سرپرست ماموریت‌ها و اعزام', 'برنامه‌ریزی، تایید و هماهنگی ماموریت‌های کاری و لجستیک', 'purple', now);

  const structCount = (db.prepare('SELECT count(*) as count FROM project_structures').get() as any).count;
  if (structCount === 0) {
    const insertStruct = db.prepare(`
      INSERT INTO project_structures (id, title, code, description, category, defaultWorkflowId, orderIndex, isActive, createdAt)
      VALUES (?, ?, ?, ?, ?, NULL, ?, 1, ?)
    `);

    const orgStructures = [
      ['pstr-org', 'ساختار اصلی و راهبری شورا', 'COUNCIL_MAIN', 'ساختار کلان تصمیم‌گیری، بررسی طرح‌ها و مصوبات عالیه', 'سازمان مرکزی', 1],
      ['pstr-leave', 'ساختار مرخصی و رفاهی پرسنل', 'LEAVE_AFFAIRS', 'فرآیند ثبت، تایید و گردش درخواست‌های مرخصی و تسهیلات اعضا', 'امور اداری', 2],
      ['pstr-mission', 'ساختار ماموریت‌ها و اعزام', 'MISSION_AFFAIRS', 'مدیریت و تایید احکام ماموریت‌های درون‌استانی و برون‌استانی', 'اعزام و ماموریت', 3],
      ['pstr-finance', 'ساختار مالی، بودجه و قراردادها', 'FINANCE_AFFAIRS', 'کنترل اعتبارات، پیش‌پرداخت‌ها و تسویه‌حساب نهایی پروژه‌ها', 'امور مالی', 4],
      ['pstr-eval', 'ساختار نظارت و ارزیابی کیفی', 'QUALITY_EVAL', 'بررسی‌های فنی، استانداردهای تولید و ارزیابی نهایی خروجی‌ها', 'نظارت و ارزیابی', 5],
    ];

    for (const s of orgStructures) {
      insertStruct.run(s[0], s[1], s[2], s[3], s[4], s[5], now);
    }
  }

  // Ensure permission p-28 exists even in existing database
  try {
    db.prepare(`
      INSERT OR IGNORE INTO permissions (id, code, title, category, parentCode, description, isDanger)
      VALUES ('p-28', 'system.structures.manage', 'تعریف و مدیریت ساختارهای سازمانی', 'ساختارهای سازمانی', 'org', 'تعریف ساختارهای اداری، مالی، ماموریت، مرخصی و چیدمان سمت‌ها', 1)
    `).run();
    db.prepare("INSERT OR IGNORE INTO position_permissions (positionId, permissionCode) VALUES ('pos-1', 'system.structures.manage')").run();
    db.prepare("INSERT OR IGNORE INTO position_permissions (positionId, permissionCode) VALUES ('pos-root', 'system.structures.manage')").run();
  } catch (e) {}

  // 7. Seed Projects (مستقیماً برای تمام اعضای شورا در کارتابل ارسال می‌شود)
  const prjCount = (db.prepare('SELECT count(*) as count FROM projects').get() as any).count;
  if (prjCount === 0) {
    const insertPrj = db.prepare(`
      INSERT INTO projects (
        id, title, code, description, productionType, location, deadline, budgetEstimated,
        status, majorityResult, requirementsJson, createdById, workflowId, currentStepOrder, currentPositionId, createdAt, updatedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'IN_REVIEW', 'PENDING', ?, ?, NULL, 1, 'pos-1', ?, ?)
    `);

    const req1 = JSON.stringify({ cameraman_count: '3', director_count: '1', producer_count: '1', host_count: '0', lighting_count: '2', sound_count: '2', transport_count: '2', support_count: '3', editor_count: '2', photographer_count: '1' });
    const req2 = JSON.stringify({ cameraman_count: '4', director_count: '1', producer_count: '1', host_count: '2', lighting_count: '3', sound_count: '2', transport_count: '3', support_count: '4', editor_count: '1', photographer_count: '1' });
    const req3 = JSON.stringify({ cameraman_count: '2', director_count: '1', producer_count: '1', host_count: '0', lighting_count: '1', sound_count: '1', transport_count: '1', support_count: '1', editor_count: '1', photographer_count: '1' });

    insertPrj.run('prj-101', 'مستند تاریخی شکوه زاگرس (فصل دوم)', 'PRJ-1403-01', 'مستند فاخر ۱۰ قسمتی پیرامون طبیعت و تاریخ فلات مرکزی.', 'مستندسازی', 'استان لرستان و چهارمحال', '۱۴۰۳/۰۹/۱۵', '۱٬۲۰۰٬۰۰۰٬۰۰۰ تومان', req1, 'usr-admin', now, now);
    insertPrj.run('prj-102', 'برنامه گفتگومحور نگاه نو (ویژه شبکه یک)', 'PRJ-1403-02', 'برنامه ترکیبی زنده هفتگی با حضور کارشناسان ارشد فناوری.', 'برنامه استودیویی', 'استودیو شماره ۱ جام جم', '۱۴۰۳/۰۹/۲۰', '۸۵۰٬۰۰۰٬۰۰۰ تومان', req2, 'usr-admin', now, now);
    insertPrj.run('prj-103', 'مجموعه کوتاه داستانی رهسپار', 'PRJ-1403-03', 'مجموعه کوتاه درام با محوریت مهارت‌های زندگی و خانواده ایرانی.', 'تولید نمایشی', 'تهران و حومه', '۱۴۰۳/۰۹/۲۵', '۶۰۰٬۰۰۰٬۰۰۰ تومان', req3, 'usr-admin', now, now);

    // Votes
    const insertVote = db.prepare('INSERT INTO votes (id, projectId, userId, status, reason, votedAt) VALUES (?, ?, ?, ?, ?, ?)');
    insertVote.run('vot-1', 'prj-101', 'usr-rezaei', 'APPROVED', 'طرح فیلمنامه غنی و تیم فنی کاملاً متناسب با حجم لوکیشن‌های کوهستانی است.', now);
    insertVote.run('vot-2', 'prj-101', 'usr-tehrani', 'APPROVED', 'تجهیزات تصویربرداری و تعداد صدابرداران تایید می‌گردد.', now);
    insertVote.run('vot-3', 'prj-101', 'usr-hoseini', 'NEEDS_REVISION', 'تعداد نفرات ترابری و برآورد بنزین نیازمند بازبینی و کاهش حدود ۱۵ درصدی است.', now);

    insertVote.run('vot-4', 'prj-102', 'usr-rezaei', 'NEEDS_REVISION', 'حضور دو مجری همزمان برای این فرمت مناسب نیست؛ درخواست تقلیل به ۱ مجری.', now);
    insertVote.run('vot-5', 'prj-102', 'usr-tehrani', 'NEEDS_REVISION', 'تعداد ۴ تصویربردار برای یک استودیوی گفتگومحور مازاد است.', now);
    insertVote.run('vot-6', 'prj-102', 'usr-moradi', 'REJECTED', 'همپوشانی موضوعی با برنامه قبلی دارد.', now);
  }

  // 8. Seed Structure Positions and User Assignments per Structure
  const spCount = (db.prepare('SELECT count(*) as count FROM structure_positions').get() as any).count;
  if (spCount === 0) {
    const insertSP = db.prepare(`
      INSERT INTO structure_positions (id, structureId, positionId, parentId, orderIndex, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertSPU = db.prepare(`
      INSERT OR IGNORE INTO structure_position_users (structurePositionId, userId)
      VALUES (?, ?)
    `);

    // Structure 1: ساختار اصلی و راهبری شورا (pstr-org)
    insertSP.run('sp-org-root', 'pstr-org', 'pos-1', null, 1, now); // دبیر شورا
    insertSPU.run('sp-org-root', 'usr-admin');

    insertSP.run('sp-org-c1', 'pstr-org', 'pos-2', 'sp-org-root', 1, now); // ناظر کیفی
    insertSPU.run('sp-org-c1', 'usr-rezaei');

    insertSP.run('sp-org-c2', 'pstr-org', 'pos-3', 'sp-org-root', 2, now); // مدیر فنی
    insertSPU.run('sp-org-c2', 'usr-tehrani');

    // Structure 2: ساختار ماموریت‌ها و اعزام (pstr-mission)
    // Here: مدیر مالی (pos-fin) is assigned in Mission structure!
    insertSP.run('sp-mis-root', 'pstr-mission', 'pos-mission-lead', null, 1, now); // سرپرست ماموریت‌ها
    insertSPU.run('sp-mis-root', 'usr-moradi');

    insertSP.run('sp-mis-c1', 'pstr-mission', 'pos-fin', 'sp-mis-root', 1, now); // مدیر مالی در ساختار ماموریت!
    insertSPU.run('sp-mis-c1', 'usr-hoseini');

    // Structure 3: ساختار مرخصی و رفاهی پرسنل (pstr-leave)
    // Here: مدیر مالی (pos-fin) is ALSO assigned in Leave structure!
    insertSP.run('sp-lea-root', 'pstr-leave', 'pos-admin-affairs', null, 1, now); // مدیر امور اداری
    insertSPU.run('sp-lea-root', 'usr-rezaei');

    insertSP.run('sp-lea-c1', 'pstr-leave', 'pos-fin', 'sp-lea-root', 1, now); // مدیر مالی در ساختار مرخصی!
    insertSPU.run('sp-lea-c1', 'usr-hoseini');

    // Structure 4: ساختار مالی و بودجه (pstr-finance)
    insertSP.run('sp-fin-root', 'pstr-finance', 'pos-fin', null, 1, now);
    insertSPU.run('sp-fin-root', 'usr-hoseini');
  }

  // 9. Seed Sample Project Attachments
  const attCount = (db.prepare('SELECT count(*) as count FROM project_attachments').get() as any).count;
  if (attCount === 0) {
    const sampleTextPdf = `data:text/plain;charset=utf-8;base64,${Buffer.from(
      'پیوست مستند شکوه زاگرس:\nطرح فیلم‌نامه، سیناپس ۱۰ قسمتی و برآورد تجهیزات تصویربرداری و کوهستانی.'
    ).toString('base64')}`;

    const sampleTextExcel = `data:text/plain;charset=utf-8;base64,${Buffer.from(
      'جدول ریز هزینه‌ها و دستمزد عوامل تولید مستند شکوه زاگرس فصل دوم - پاییز ۱۴۰۳'
    ).toString('base64')}`;

    const insertAtt = db.prepare(`
      INSERT INTO project_attachments (id, projectId, fileName, fileSize, fileType, data, uploadedBy, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertAtt.run(
      'att-101',
      'prj-101',
      'طرح_فیلم‌نامه_و_سیناپس_زاگرس.pdf',
      2457600, // ~2.4 MB
      'application/pdf',
      sampleTextPdf,
      'usr-admin',
      now
    );

    insertAtt.run(
      'att-102',
      'prj-101',
      'جدول_برآورد_بودجه_عوامل.xlsx',
      1048576, // 1 MB
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sampleTextExcel,
      'usr-admin',
      now
    );
  }

  // 8. Seed System Settings
  const settingCount = (db.prepare('SELECT count(*) as count FROM system_settings').get() as any)?.count || 0;
  if (settingCount === 0) {
    const insertSetting = db.prepare('INSERT INTO system_settings (key, value, description, updatedAt) VALUES (?, ?, ?, ?)');
    insertSetting.run('enforce_deadline', 'true', 'جلوگیری از ثبت رای پس از اتمام مهلت ارزیابی', now);
    insertSetting.run('default_deadline_days', '14', 'مدت زمان پیش‌فرض مهلت ارزیابی پروژه‌ها (روز)', now);
    insertSetting.run('allow_creator_extension', 'true', 'امکان تمدید مهلت و بازگشایی مجدد رای‌گیری توسط ثبت‌کننده یا مدیر', now);
  }
}

export { db };
