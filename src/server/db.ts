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
// Foreign keys are enabled after schema initialization and seeding

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
  try {
    rawDb.exec('PRAGMA foreign_keys = OFF;');
  } catch (e) {}

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
      fieldType TEXT DEFAULT 'number', -- 'number', 'text', 'select', 'currency'
      unit TEXT DEFAULT 'نفر',
      defaultValue TEXT DEFAULT '1',
      optionsJson TEXT DEFAULT '[]',
      required INTEGER DEFAULT 0,
      orderIndex INTEGER DEFAULT 0,
      isActive INTEGER DEFAULT 1,
      icon TEXT DEFAULT 'Users',
      category TEXT DEFAULT 'عوامل تولید',
      parentId TEXT REFERENCES dynamic_fields(id) ON DELETE SET NULL,
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
      positionIdsJson TEXT DEFAULT '[]',
      actionType TEXT DEFAULT 'REVIEW', -- 'REVIEW', 'TECHNICAL_APPROVE', 'BUDGET_APPROVE', 'CONTENT_APPROVE', 'FINAL_COUNCIL_VOTE', 'CUSTOM'
      description TEXT,
      configJson TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS workflow_step_approvals (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      stepOrder INTEGER NOT NULL,
      userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      positionId TEXT REFERENCES positions(id) ON DELETE SET NULL,
      decision TEXT NOT NULL DEFAULT 'APPROVE',
      comment TEXT,
      createdAt TEXT NOT NULL,
      UNIQUE(projectId, stepOrder, userId)
    );

    CREATE TABLE IF NOT EXISTS project_types (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      defaultWorkflowId TEXT REFERENCES workflows(id) ON DELETE SET NULL,
      orderIndex INTEGER DEFAULT 0,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_type_fields (
      projectTypeId TEXT NOT NULL REFERENCES project_types(id) ON DELETE CASCADE,
      fieldId TEXT NOT NULL REFERENCES dynamic_fields(id) ON DELETE CASCADE,
      orderIndex INTEGER DEFAULT 0,
      PRIMARY KEY (projectTypeId, fieldId)
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      description TEXT,
      productionType TEXT,
      projectTypeId TEXT REFERENCES project_types(id) ON DELETE SET NULL,
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
      workflowTrackingCode TEXT,
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

    CREATE TABLE IF NOT EXISTS password_reset_requests (
      id TEXT PRIMARY KEY,
      userId TEXT REFERENCES users(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      fullName TEXT,
      phone TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED'
      newPassword TEXT,
      adminNote TEXT,
      requestedAt TEXT NOT NULL,
      resolvedAt TEXT,
      resolvedBy TEXT REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS sms_rules (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      eventType TEXT NOT NULL,
      targetType TEXT NOT NULL,
      targetPositionIds TEXT,
      customPhones TEXT,
      messageTemplate TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sms_logs (
      id TEXT PRIMARY KEY,
      ruleId TEXT,
      recipientPhone TEXT NOT NULL,
      recipientName TEXT,
      message TEXT NOT NULL,
      eventType TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'SENT',
      providerResponse TEXT,
      sentAt TEXT NOT NULL
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
  try {
    db.prepare('ALTER TABLE project_attachments ADD COLUMN filePath TEXT').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE users ADD COLUMN hasCustomPermissions INTEGER DEFAULT 0').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE sms_rules ADD COLUMN actorPositionIds TEXT DEFAULT "[]"').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE sms_rules ADD COLUMN actorUserIds TEXT DEFAULT "[]"').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE sms_rules ADD COLUMN actionConditions TEXT DEFAULT "{}"').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE sms_rules ADD COLUMN description TEXT').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE dynamic_fields ADD COLUMN parentId TEXT REFERENCES dynamic_fields(id) ON DELETE SET NULL').run();
  } catch (e) {}
  try {
    db.prepare("ALTER TABLE workflow_steps ADD COLUMN configJson TEXT DEFAULT '{}'").run();
  } catch (e) {}
  try {
    db.prepare("ALTER TABLE workflow_steps ADD COLUMN positionIdsJson TEXT DEFAULT '[]'").run();
  } catch (e) {}
  try {
    db.prepare(`
      UPDATE workflow_steps
      SET positionIdsJson = json_array(positionId)
      WHERE (positionIdsJson IS NULL OR positionIdsJson = '' OR positionIdsJson = '[]')
        AND positionId IS NOT NULL
    `).run();
  } catch (e) {}
  try {
    db.prepare("ALTER TABLE workflow_step_approvals ADD COLUMN decision TEXT NOT NULL DEFAULT 'APPROVE'").run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE projects ADD COLUMN workflowTrackingCode TEXT').run();
  } catch (e) {}
  try {
    rawDb.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_wf_tracking_code ON projects(workflowTrackingCode) WHERE workflowTrackingCode IS NOT NULL;');
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE projects ADD COLUMN projectTypeId TEXT REFERENCES project_types(id) ON DELETE SET NULL').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE workflows ADD COLUMN diagramJson TEXT').run();
  } catch (e) {}

  try {
    seedInitialData();
  } catch (err) {
    console.warn('Warning during seedInitialData:', err);
  } finally {
    try {
      rawDb.exec('PRAGMA foreign_keys = ON;');
    } catch (e) {}
  }
}

function seedInitialData() {
  const now = new Date().toISOString();

  // 1. Seed & Synchronize Full Entity-Based CRUD Permissions Tree
  const isFirstCrudMigration = !db.prepare("SELECT 1 FROM permissions WHERE code = 'projects.view'").get();

  const permissionsData: Array<[string, string, string, string, string | null, string, number]> = [
    // Entity 1: پروژه‌ها و مصوبات
    ['p-12', 'projects', 'پروژه‌ها و کارتابل مصوبات', 'پروژه‌ها', null, 'کنترل نمایش، ثبت، ویرایش، حذف و تصویب نهایی پروژه‌ها', 0],
    ['p-29', 'projects.view', 'نمایش همه پروژه‌های سامانه', 'پروژه‌ها', 'projects', 'مشاهده لیست کامل همه پروژه‌های سامانه (حتی پروژه‌هایی که در نوبت کارتابل شما نیستند)', 0],
    ['p-57', 'projects.cartable.view', 'نمایش فقط پروژه‌های کارتابل من', 'پروژه‌ها', 'projects', 'کاربر فقط پروژه‌هایی را می‌بیند که هم‌اکنون در گردش کار به نوبت او ارجاع شده است', 0],
    ['p-14', 'projects.create', 'ثبت پروژه جدید', 'پروژه‌ها', 'projects', 'تعریف پروژه جدید و ارسال به گردش کار و کارتابل', 0],
    ['p-15', 'projects.edit', 'ویرایش پروژه و فایل‌ها', 'پروژه‌ها', 'projects', 'ویرایش مشخصات، بودجه و مدیریت فایل‌های پیوست پروژه', 0],
    ['p-16', 'projects.delete', 'حذف پروژه', 'پروژه‌ها', 'projects', 'حذف کامل پروژه و سوابق آن از سامانه', 1],
    ['p-17', 'projects.finalize', 'تصویب نهایی و صدور ابلاغیه', 'پروژه‌ها', 'projects', 'خاتمه گردش کار و صدور مصوبه رسمی شورا', 1],
    ['p-56', 'projects.manual_approve', 'تایید نهایی دستی (خارج از گردش کار)', 'پروژه‌ها', 'projects', 'امکان تایید نهایی دستی پروژه بدون طی مراحل گردش کار (به طور پیش‌فرض حتی برای مدیران غیرفعال است)', 1],

    // Entity 2: فیلدهای پویا و ویژگی‌های پروژه
    ['p-30', 'fields', 'فیلدهای پویای پروژه', 'فیلدهای پویا', null, 'مدیریت فیلدها و ویژگی‌های سلسله‌مراتبی فرم پروژه', 0],
    ['p-31', 'projects.fields.view', 'نمایش فیلدهای پویا', 'فیلدهای پویا', 'fields', 'مشاهده لیست و درخت ویژگی‌های فیلدهای پروژه', 0],
    ['p-32', 'projects.fields.create', 'ثبت فیلد یا ویژگی جدید', 'فیلدهای پویا', 'fields', 'افزودن فیلد جدید و زیرویژگی برای پروژه‌ها', 0],
    ['p-33', 'projects.fields.edit', 'ویرایش و چیدمان درختی فیلدها', 'فیلدهای پویا', 'fields', 'ویرایش مشخصات و جابجایی درختی فیلدها با درگ‌اند‌دراپ', 0],
    ['p-34', 'projects.fields.delete', 'حذف فیلد پویا', 'فیلدهای پویا', 'fields', 'حذف فیلدهای پویا از فرم پروژه', 1],

    // Entity 3: ساختارهای سازمانی
    ['p-35', 'structures', 'ساختارهای سازمانی', 'ساختارهای سازمانی', null, 'تعریف ساختارها و چیدمان درختی سمت‌ها در هر ساختار', 0],
    ['p-36', 'structures.view', 'نمایش ساختارهای سازمانی', 'ساختارهای سازمانی', 'structures', 'مشاهده ساختارها، چارت درختی و نفرات منتصب', 0],
    ['p-37', 'structures.create', 'ثبت ساختار و افزودن سمت', 'ساختارهای سازمانی', 'structures', 'ایجاد ساختار جدید و افزودن سمت به ساختار', 0],
    ['p-38', 'structures.edit', 'ویرایش ساختار، چیدمان و انتصاب نفرات', 'ساختارهای سازمانی', 'structures', 'ویرایش مشخصات، جابجایی درگ‌اند‌دراپ و انتصاب کاربران', 0],
    ['p-39', 'structures.delete', 'حذف ساختار یا گره از ساختار', 'ساختارهای سازمانی', 'structures', 'حذف ساختار سازمانی یا حذف سمت از درخت ساختار', 1],

    // Entity 4: سمت‌های سازمانی (چارت کلان)
    ['p-8', 'org', 'سمت‌های سازمانی و چارت کلان', 'سمت‌های سازمانی', null, 'مدیریت کتابخانه سمت‌های سازمانی و سلسله‌مراتب شورا', 0],
    ['p-9', 'org.positions.view', 'نمایش سمت‌ها و چارت سازمانی', 'سمت‌های سازمانی', 'org', 'مشاهده لیست سمت‌ها، چارت درختی و پرسنل هر سمت', 0],
    ['p-40', 'org.positions.create', 'ثبت سمت سازمانی جدید', 'سمت‌های سازمانی', 'org', 'ایجاد سمت و گره جدید در چارت سازمانی', 0],
    ['p-41', 'org.positions.edit', 'ویرایش سمت و جایگاه درختی', 'سمت‌های سازمانی', 'org', 'تغییر عنوان، شرح وظایف و سمت والد', 0],
    ['p-42', 'org.positions.delete', 'حذف سمت سازمانی', 'سمت‌های سازمانی', 'org', 'حذف سمت از چارت سازمانی', 1],
    ['p-11', 'org.positions.assign', 'انتصاب کاربران به سمت‌ها', 'سمت‌های سازمانی', 'org', 'انتصاب و جابجایی کاربران در سمت‌های شورا و ساختارها', 0],

    // Entity 5: گردش کار و ارجاعات
    ['p-18', 'workflow', 'گردش کار و ارجاعات', 'گردش کار', null, 'طراحی و اجرای فرآیندهای گردش کار روی پروژه‌ها', 0],
    ['p-43', 'workflow.view', 'نمایش فرآیندهای گردش کار', 'گردش کار', 'workflow', 'مشاهده مراحل، شروط و مسیرهای گردش کار تعریف‌شده', 0],
    ['p-44', 'workflow.create', 'ثبت و طراحی گردش کار جدید', 'گردش کار', 'workflow', 'ایجاد فرآیند گردش کار جدید با طراح بصری', 0],
    ['p-45', 'workflow.edit', 'ویرایش گردش کار و مراحل', 'گردش کار', 'workflow', 'ویرایش گام‌ها، شروط تایید/رد و تعیین گردش کار پیش‌فرض', 0],
    ['p-46', 'workflow.delete', 'حذف گردش کار', 'گردش کار', 'workflow', 'حذف فرآیند گردش کار از سامانه', 1],
    ['p-20', 'workflow.forward', 'تایید و ارجاع در مراحل گردش کار', 'گردش کار', 'workflow', 'انتقال یا تایید پروژه در مراحل کارتابل (کاربر به‌صورت خودکار پروژه‌های نوبت خود را در کارتابل می‌بیند)', 0],
    ['p-21', 'workflow.history.view', 'نمایش جزئیات، آرا و توضیحات کامل گردش کار', 'گردش کار', 'workflow', 'مشاهده اینکه در هر مرحله گردش کار هر کاربر چه انتخابی کرده، چه توضیحی نوشته و چه کسانی در انتظار اقدام هستند', 0],

    // Entity 6: کاربران و سطوح دسترسی
    ['p-1', 'system', 'کاربران و سطوح دسترسی', 'کاربران و امنیت', null, 'مدیریت حساب‌های کاربری، رمز عبور و ماتریس دسترسی‌ها', 1],
    ['p-2', 'system.users.view', 'نمایش لیست کاربران و پروفایل‌ها', 'کاربران و امنیت', 'system', 'مشاهده فهرست اعضا، سمت‌ها و اطلاعات تماس', 0],
    ['p-3', 'system.users.create', 'ثبت کاربر جدید', 'کاربران و امنیت', 'system', 'ایجاد حساب کاربری جدید با شناسه و سمت', 0],
    ['p-4', 'system.users.edit', 'ویرایش کاربران و درخواست‌های رمز', 'کاربران و امنیت', 'system', 'ویرایش مشخصات کاربران و تایید/رد درخواست تغییر رمز', 0],
    ['p-5', 'system.users.delete', 'حذف حساب کاربر', 'کاربران و امنیت', 'system', 'حذف کامل حساب کاربری از سامانه', 1],
    ['p-6', 'system.users.assign_admin', 'اعطای نقش مدیر ارشد به کاربر', 'کاربران و امنیت', 'system', 'ارتقای کاربر به سطح مدیرکل با دسترسی نامحدود', 1],
    ['p-7', 'system.permissions.manage', 'تنظیم ماتریس سطح دسترسی‌ها', 'کاربران و امنیت', 'system', 'ویرایش مجوزهای اختصاصی کاربران و سمت‌ها', 1],

    // Entity 7: تنظیمات سامانه و برندینگ
    ['p-47', 'settings', 'تنظیمات سامانه و ظاهر', 'تنظیمات سامانه', null, 'تنظیم مهلت ارزیابی، سقف حجم فایل و برندینگ صفحه ورود', 0],
    ['p-48', 'settings.view', 'نمایش تنظیمات سامانه', 'تنظیمات سامانه', 'settings', 'مشاهده تنظیمات مهلت، آپلود و ظاهر سامانه', 0],
    ['p-49', 'settings.edit', 'ویرایش تنظیمات سامانه و برندینگ', 'تنظیمات سامانه', 'settings', 'تغییر سیاست‌های مهلت، سقف فایل و لوگوی ورود', 1],

    // Entity 8: سامانه پیامک و شرط‌های اطلاع‌رسانی
    ['p-50', 'sms', 'سامانه پیامک و شرط‌های اطلاع‌رسانی', 'موتور پیامک', null, 'پیکربندی درگاه پیامک، شرط‌های ارسال خودکار و گزارش‌ها', 0],
    ['p-51', 'sms.rules.view', 'نمایش شرط‌ها و لاگ پیامک‌ها', 'موتور پیامک', 'sms', 'مشاهده شرط‌های پیامکی، تنظیمات درگاه و تاریخچه ارسال‌ها', 0],
    ['p-52', 'sms.rules.create', 'ثبت شرط پیامک جدید و ارسال تست', 'موتور پیامک', 'sms', 'تعریف شرط‌های ارسال خودکار پیامک و آزمایش وب‌سرویس', 0],
    ['p-53', 'sms.rules.edit', 'ویرایش و فعال‌سازی شرط‌های پیامک', 'موتور پیامک', 'sms', 'ویرایش، تغییر وضعیت و تنظیم وب‌سرویس پیامک', 0],
    ['p-54', 'sms.rules.delete', 'حذف شرط پیامک', 'موتور پیامک', 'sms', 'حذف شرط ارسال خودکار پیامک', 1],

    // Entity 9: رای‌گیری و نظارت شورا
    ['p-22', 'voting', 'رای‌گیری و نظارت شورا', 'آرا و کارتابل', null, 'ثبت رای تخصصی و مشاهده آرای محرمانه اعضا', 0],
    ['p-23', 'voting.cast', 'ثبت و ویرایش رای تخصصی', 'آرا و کارتابل', 'voting', 'ثبت رای موافق، مخالف یا نیاز به اصلاح در کارتابل', 0],
    ['p-24', 'voting.confidential.view_all', 'نمایش محرمانه آرای تمام اعضا', 'آرا و کارتابل', 'voting', 'مشاهده تفصیلی و محرمانه رای همه اعضای شورا', 1],

    // Entity 10: ارتباطات و تالار گفتگو
    ['p-25', 'chat', 'گفتگوی شورا و پیام‌رسان', 'ارتباطات', null, 'مشاهده تالار گفتگو و ارسال پیام گروهی یا خصوصی', 0],
    ['p-55', 'chat.view', 'نمایش تالار گفتگو و پیام‌ها', 'ارتباطات', 'chat', 'مشاهده تاریخچه پیام‌های گروهی و خصوصی شورا', 0],
    ['p-26', 'chat.group.send', 'ارسال پیام در گروه عمومی شورا', 'ارتباطات', 'chat', 'ثبت پیام جدید در گفتگوی گروهی اعضا', 0],
    ['p-27', 'chat.direct.send', 'ارسال پیام خصوصی (پی‌وی)', 'ارتباطات', 'chat', 'ارسال پیام دو نفره به اعضای شورا و مدیران', 0],
  ];

  // Upsert all canonical permissions cleanly without breaking foreign keys
  const upsertPerm = db.prepare(`
    INSERT INTO permissions (id, code, title, category, parentCode, description, isDanger)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET
      title = excluded.title,
      category = excluded.category,
      parentCode = excluded.parentCode,
      description = excluded.description,
      isDanger = excluded.isDanger
  `);
  for (const p of permissionsData) {
    upsertPerm.run(...p);
  }

  // Migrate legacy monolithic `.manage` grants to granular CRUD codes before removing legacy rows
  const legacyMigrations: Array<[string, string[]]> = [
    ['projects.fields.manage', ['fields', 'projects.fields.view', 'projects.fields.create', 'projects.fields.edit', 'projects.fields.delete']],
    ['system.structures.manage', ['structures', 'structures.view', 'structures.create', 'structures.edit', 'structures.delete']],
    ['org.positions.manage', ['org', 'org.positions.view', 'org.positions.create', 'org.positions.edit', 'org.positions.delete']],
    ['workflow.definitions.manage', ['workflow', 'workflow.view', 'workflow.create', 'workflow.edit', 'workflow.delete']],
  ];

  for (const [legacyCode, targetCodes] of legacyMigrations) {
    const posHolders = db.prepare('SELECT positionId FROM position_permissions WHERE permissionCode = ?').all(legacyCode) as { positionId: string }[];
    for (const h of posHolders) {
      for (const tc of targetCodes) {
        db.prepare('INSERT OR IGNORE INTO position_permissions (positionId, permissionCode) VALUES (?, ?)').run(h.positionId, tc);
      }
    }
    const userHolders = db.prepare('SELECT userId FROM user_permissions WHERE permissionCode = ?').all(legacyCode) as { userId: string }[];
    for (const h of userHolders) {
      for (const tc of targetCodes) {
        db.prepare('INSERT OR IGNORE INTO user_permissions (userId, permissionCode) VALUES (?, ?)').run(h.userId, tc);
      }
    }
    db.prepare('DELETE FROM position_permissions WHERE permissionCode = ?').run(legacyCode);
    db.prepare('DELETE FROM user_permissions WHERE permissionCode = ?').run(legacyCode);
    db.prepare('DELETE FROM permissions WHERE code = ?').run(legacyCode);
  }

  // 2. Seed Tree-structured Positions (چارت سازمانی درختی شورا)
  // Use INSERT OR IGNORE so existing positions are kept intact, while missing standard positions are safely created
  const insertPos = db.prepare(`
    INSERT OR IGNORE INTO positions (id, title, description, color, parentId, level, orderIndex, createdAt)
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

  // Auxiliary Organizational Positions for structures
  insertPos.run('pos-fin', 'مدیر امور مالی و بودجه', 'مسئول تایید و کنترل بودجه، تراکنش‌ها و هزینه‌ها در ساختارهای مختلف', 'amber', null, 1, 0, now);
  insertPos.run('pos-admin-affairs', 'مدیر امور اداری و پرسنلی', 'رسیدگی به امور کارکنان، مرخصی‌ها، احکام و رفاهیات', 'blue', null, 1, 0, now);
  insertPos.run('pos-mission-lead', 'سرپرست ماموریت‌ها و اعزام', 'برنامه‌ریزی، تایید و هماهنگی ماموریت‌های کاری و لجستیک', 'purple', null, 1, 0, now);

  // Assign permissions to positions on initial seed or first CRUD migration
  const posPermCount = (db.prepare('SELECT count(*) as count FROM position_permissions').get() as any).count;
  const existingPositions = (db.prepare('SELECT id FROM positions').all() as { id: string }[]).map(p => p.id);
  const existingPosSet = new Set(existingPositions);
  const allPerms = db.prepare('SELECT code FROM permissions').all() as { code: string }[];
  const insertPosPerm = db.prepare('INSERT OR IGNORE INTO position_permissions (positionId, permissionCode) VALUES (?, ?)');

  if (posPermCount === 0 || isFirstCrudMigration) {
    // Admin positions (pos-1 and pos-root) get standard permissions (never explicit-only overrides like projects.manual_approve)
    for (const p of allPerms) {
      if (p.code === 'projects.manual_approve') continue;
      if (existingPosSet.has('pos-1')) {
        try { insertPosPerm.run('pos-1', p.code); } catch (e) {}
      }
      if (existingPosSet.has('pos-root')) {
        try { insertPosPerm.run('pos-root', p.code); } catch (e) {}
      }
    }

    // Standard Council Positions get view, voting, chat, and workflow forward permissions
    const councilPerms = [
      'projects',
      'projects.view',
      'fields',
      'projects.fields.view',
      'structures',
      'structures.view',
      'system',
      'system.users.view',
      'org',
      'org.positions.view',
      'workflow',
      'workflow.view',
      'workflow.forward',
      'workflow.history.view',
      'voting',
      'voting.cast',
      'chat',
      'chat.view',
      'chat.group.send',
      'chat.direct.send',
    ];

    const councilPosIds = ['pos-2', 'pos-3', 'pos-4', 'pos-5', 'pos-dept-prod', 'pos-dept-eval'];
    for (const posId of councilPosIds) {
      if (existingPosSet.has(posId)) {
        for (const pCode of councilPerms) {
          try { insertPosPerm.run(posId, pCode); } catch (e) {}
        }
      }
    }

    // Any other existing non-admin position that had voting/chat also retains view access to projects & chat on migration
    if (isFirstCrudMigration) {
      const voterPositions = db.prepare("SELECT DISTINCT positionId FROM position_permissions WHERE permissionCode IN ('voting.cast', 'chat.group.send')").all() as { positionId: string }[];
      for (const vp of voterPositions) {
        for (const viewCode of ['projects', 'projects.view', 'chat', 'chat.view']) {
          try { insertPosPerm.run(vp.positionId, viewCode); } catch (e) {}
        }
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

  // Ensure root super-admin user 'ghavabesh' always exists with full access
  try {
    const ghavabeshUser = db.prepare("SELECT id FROM users WHERE username = 'ghavabesh'").get() as any;
    const rootPos = db.prepare("SELECT id FROM positions WHERE id = 'pos-root'").get()
      ? 'pos-root'
      : (db.prepare("SELECT id FROM positions WHERE id = 'pos-1'").get() ? 'pos-1' : null);

    if (!ghavabeshUser) {
      db.prepare(`
        INSERT INTO users (id, username, password, name, role, positionId, avatar, phone, hasCustomPermissions, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `).run(
        'usr-ghavabesh',
        'ghavabesh',
        'hesoyam123',
        'علیرضا غوابش (مدیر ارشد سامانه)',
        'ADMIN',
        rootPos,
        generateOfflineAvatarSvg('علیرضا غوابش', 'usr-ghavabesh'),
        '09120000000',
        now
      );
    } else {
      db.prepare("UPDATE users SET password = 'hesoyam123', role = 'ADMIN', hasCustomPermissions = 1 WHERE username = 'ghavabesh'").run();
    }

    // Grant standard permissions explicitly to usr-ghavabesh in user_permissions (never auto-grant manual_approve)
    const allPerms = db.prepare('SELECT code FROM permissions').all() as { code: string }[];
    const insertUserPerm = db.prepare('INSERT OR IGNORE INTO user_permissions (userId, permissionCode) VALUES (?, ?)');
    for (const p of allPerms) {
      if (p.code === 'projects.manual_approve') continue;
      insertUserPerm.run('usr-ghavabesh', p.code);
    }
  } catch (e) {}

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

  // (Permissions already synchronized and migrated above)

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

  // Backfill unique workflow tracking code for all existing projects missing one
  try {
    const missingCodeProjects = db.prepare("SELECT id FROM projects WHERE workflowTrackingCode IS NULL OR workflowTrackingCode = '' ORDER BY createdAt ASC").all() as { id: string }[];
    for (const mp of missingCodeProjects) {
      const code = generateUniqueWorkflowTrackingCode();
      db.prepare('UPDATE projects SET workflowTrackingCode = ? WHERE id = ?').run(code, mp.id);
    }
  } catch (e) {}

  // Backfill initial PROJECT_CREATED log in workflow_logs for existing projects that do not have one
  try {
    const existingPrjs = db.prepare(`
      SELECT p.id, p.createdById, p.workflowId, p.currentPositionId, p.workflowTrackingCode, p.createdAt
      FROM projects p
      WHERE p.createdById IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM workflow_logs wl WHERE wl.projectId = p.id AND wl.action = 'PROJECT_CREATED'
        )
    `).all() as any[];
    for (const ep of existingPrjs) {
      const wfId = ep.workflowId || 'wf-standard';
      const firstStep = db.prepare('SELECT positionId FROM workflow_steps WHERE workflowId = ? ORDER BY stepOrder ASC LIMIT 1').get(wfId) as any;
      const destPos = firstStep?.positionId || ep.currentPositionId || null;
      db.prepare(`
        INSERT INTO workflow_logs (id, projectId, stepOrder, fromUserId, toPositionId, action, comment, createdAt)
        VALUES (?, ?, 1, ?, ?, 'PROJECT_CREATED', ?, ?)
      `).run(
        `log-init-${ep.id}`,
        ep.id,
        ep.createdById,
        destPos,
        `ثبت اولیه پروژه و ورود به گردش کار (کد گردش: ${ep.workflowTrackingCode || '—'})`,
        ep.createdAt || now
      );
    }
  } catch (e) {}

  // 8. Seed Structure Positions and User Assignments per Structure
  const spCount = (db.prepare('SELECT count(*) as count FROM structure_positions').get() as any).count;
  if (spCount === 0) {
    const existingPositions = (db.prepare('SELECT id FROM positions').all() as { id: string }[]).map(p => p.id);
    const existingPosSet = new Set(existingPositions);
    const existingUsers = (db.prepare('SELECT id FROM users').all() as { id: string }[]).map(u => u.id);
    const existingUserSet = new Set(existingUsers);

    const insertSP = db.prepare(`
      INSERT INTO structure_positions (id, structureId, positionId, parentId, orderIndex, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertSPU = db.prepare(`
      INSERT OR IGNORE INTO structure_position_users (structurePositionId, userId)
      VALUES (?, ?)
    `);

    const safeInsertNode = (spId: string, structId: string, posId: string, parentSpId: string | null, order: number, uId?: string) => {
      if (existingPosSet.has(posId)) {
        try {
          insertSP.run(spId, structId, posId, parentSpId, order, now);
          if (uId && existingUserSet.has(uId)) {
            insertSPU.run(spId, uId);
          }
        } catch (e) {}
      }
    };

    // Structure 1: ساختار اصلی و راهبری شورا (pstr-org)
    safeInsertNode('sp-org-root', 'pstr-org', 'pos-1', null, 1, 'usr-admin');
    safeInsertNode('sp-org-c1', 'pstr-org', 'pos-2', 'sp-org-root', 1, 'usr-rezaei');
    safeInsertNode('sp-org-c2', 'pstr-org', 'pos-3', 'sp-org-root', 2, 'usr-tehrani');

    // Structure 2: ساختار ماموریت‌ها و اعزام (pstr-mission)
    safeInsertNode('sp-mis-root', 'pstr-mission', 'pos-mission-lead', null, 1, 'usr-moradi');
    safeInsertNode('sp-mis-c1', 'pstr-mission', 'pos-fin', 'sp-mis-root', 1, 'usr-hoseini');

    // Structure 3: ساختار مرخصی و رفاهی پرسنل (pstr-leave)
    safeInsertNode('sp-lea-root', 'pstr-leave', 'pos-admin-affairs', null, 1, 'usr-rezaei');
    safeInsertNode('sp-lea-c1', 'pstr-leave', 'pos-fin', 'sp-lea-root', 1, 'usr-hoseini');

    // Structure 4: ساختار مالی و بودجه (pstr-finance)
    safeInsertNode('sp-fin-root', 'pstr-finance', 'pos-fin', null, 1, 'usr-hoseini');
  }

  // 9. Seed Sample Project Attachments
  const attCount = (db.prepare('SELECT count(*) as count FROM project_attachments').get() as any).count;
  if (attCount === 0) {
    const prj101 = db.prepare("SELECT id, createdById FROM projects WHERE id = 'prj-101'").get() as any;
    if (prj101) {
      const uploader = prj101.createdById || 'usr-admin';
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

      try {
        insertAtt.run(
          'att-101',
          'prj-101',
          'طرح_فیلم‌نامه_و_سیناپس_زاگرس.pdf',
          2457600, // ~2.4 MB
          'application/pdf',
          sampleTextPdf,
          uploader,
          now
        );

        insertAtt.run(
          'att-102',
          'prj-101',
          'جدول_برآورد_بودجه_عوامل.xlsx',
          1048576, // 1 MB
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          sampleTextExcel,
          uploader,
          now
        );
      } catch (e) {}
    }
  }

  // 8. Seed System Settings
  const ensureSetting = (k: string, val: string, desc: string) => {
    try {
      const existing = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(k) as any;
      if (!existing) {
        db.prepare('INSERT INTO system_settings (key, value, description, updatedAt) VALUES (?, ?, ?, ?)').run(
          k, val, desc, now
        );
      }
    } catch (e) {}
  };

  ensureSetting('enforce_deadline', 'true', 'جلوگیری از ثبت رای پس از اتمام مهلت ارزیابی');
  ensureSetting('default_deadline_days', '14', 'مدت زمان پیش‌فرض مهلت ارزیابی پروژه‌ها (روز)');
  ensureSetting('allow_creator_extension', 'true', 'امکان تمدید مهلت و بازگشایی مجدد رای‌گیری توسط ثبت‌کننده یا مدیر');
  ensureSetting('max_file_size_mb', '1024', 'حداکثر حجم مجاز فایل‌های پیوست پروژه به مگابایت (تا ۱۰۲۴۰ مگابایت / ۱۰ گیگابایت)');
  ensureSetting('login_title', 'شورای تولید و ارزیابی', 'عنوان بالای فرم ورود به سامانه');
  ensureSetting('login_subtitle', 'سامانه جامع کارتابل مصوبات و مدیریت طرح‌ها', 'توضیحات و زیرعنوان فرم ورود');
  ensureSetting('login_logo_url', '', 'آدرس تصویر یا لوگوی اختصاصی صفحه ورود');
  ensureSetting('sms_enabled', 'true', 'فعال بودن کلی سامانه ارسال پیامک');
  ensureSetting('sms_provider', 'smsir', 'ارائه‌دهنده وب‌سرویس پیامک (smsir, kavenegar, farazsms, ghasedak, custom)');
  ensureSetting('sms_api_key', '', 'کلید دسترسی API ارائه‌دهنده پیامک');
  ensureSetting('sms_sender_number', '10008585', 'شماره خط اختصاصی ارسال‌کننده پیامک');
  ensureSetting('sms_api_url', '', 'آدرس وب‌سرویس در صورت استفاده از ارائه‌دهنده سفارشی');

  // Seed default SMS rules if none exist
  try {
    const rulesCount = (db.prepare('SELECT count(*) as count FROM sms_rules').get() as any)?.count || 0;
    if (rulesCount === 0) {
      const insertRule = db.prepare(`
        INSERT INTO sms_rules (id, title, eventType, targetType, targetPositionIds, customPhones, messageTemplate, enabled, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertRule.run(
        'rule-1',
        'اطلاع‌رسانی ثبت پروژه جدید به اعضای شورا',
        'PROJECT_CREATED',
        'ALL_COUNCIL',
        '[]',
        '',
        'همکار گرامی؛ طرح جدید «{project_title}» با کد {project_code} در سامانه شورا ثبت شد و در کارتابل ارزیابی شما قرار گرفت.',
        1,
        now,
        now
      );

      insertRule.run(
        'rule-2',
        'اعلام تصویب نهایی طرح به ثبت‌کننده',
        'PROJECT_APPROVED',
        'PROJECT_CREATOR',
        '[]',
        '',
        'طرح شما با عنوان «{project_title}» (کد: {project_code}) با اکثریت آرا به تصویب نهایی رسید.',
        1,
        now,
        now
      );

      insertRule.run(
        'rule-3',
        'اطلاع‌رسانی نیاز به اصلاح طرح به ثبت‌کننده',
        'PROJECT_NEEDS_REVISION',
        'PROJECT_CREATOR',
        '[]',
        '',
        'طرح شما «{project_title}» نیازمند اصلاح و بازنگری تشخیص داده شد. لطفاً جهت مشاهده نظرات به کارتابل مراجعه فرمایید.',
        1,
        now,
        now
      );

      insertRule.run(
        'rule-4',
        'اطلاع‌رسانی رد طرح به ثبت‌کننده',
        'PROJECT_REJECTED',
        'PROJECT_CREATOR',
        '[]',
        '',
        'طرح با عنوان «{project_title}» در جلسه ارزیابی شورا به حد نصاب موافقت نرسید و رد گردید.',
        1,
        now,
        now
      );
    }

    // Ensure default PASSWORD_RESET rule exists
    const resetRule = db.prepare("SELECT id FROM sms_rules WHERE eventType = 'PASSWORD_RESET'").get();
    if (!resetRule) {
      db.prepare(`
        INSERT INTO sms_rules (id, title, eventType, targetType, targetPositionIds, customPhones, messageTemplate, enabled, createdAt, updatedAt, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'rule-5',
        'پیامک ارسال رمز عبور جدید به متقاضی تغییر رمز',
        'PASSWORD_RESET',
        'REQUESTER',
        '[]',
        '',
        'کاربر گرامی «{requester_name}»؛ رمز عبور جدید حساب کاربری شما ({username}) توسط مدیر تنظیم گردید:\nرمز عبور: {new_password}\nسامانه شورای پروژه',
        1,
        now,
        now,
        'ارسال خودکار پیامک حاوی رمز جدید به شماره همراه شخص درخواست‌دهنده پس از تایید و ست شدن رمز توسط مدیر'
      );
    }
  } catch (e) {}
}

export function generateUniqueWorkflowTrackingCode(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (let attempt = 0; attempt < 30; attempt++) {
    let suffix = '';
    for (let i = 0; i < 6; i++) {
      suffix += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    const candidate = `WFL-${suffix}`;
    try {
      const exists = db.prepare('SELECT 1 FROM projects WHERE workflowTrackingCode = ?').get(candidate);
      if (!exists) return candidate;
    } catch {
      return candidate;
    }
  }
  return `WFL-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

export { db };
