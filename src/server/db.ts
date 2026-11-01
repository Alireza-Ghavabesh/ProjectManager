import Database from 'better-sqlite3';
import path from 'path';

// Database file path in root directory as requested: council.db
const dbDir = path.resolve(process.cwd());
const dbPath = path.join(dbDir, 'council.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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

    insertUser.run('usr-admin', 'admin', 'admin123', 'مهندس علیرضا علوی', 'ADMIN', 'pos-1', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', '09121112233', now);
    insertUser.run('usr-rezaei', 'rezaei', '123456', 'دکتر فاطمه رضایی', 'COUNCIL', 'pos-2', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150', '09122223344', now);
    insertUser.run('usr-tehrani', 'tehrani', '123456', 'مهندس سهراب تهرانی', 'COUNCIL', 'pos-3', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', '09123334455', now);
    insertUser.run('usr-moradi', 'moradi', '123456', 'پیمان مرادی', 'COUNCIL', 'pos-4', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150', '09124445566', now);
    insertUser.run('usr-hoseini', 'hoseini', '123456', 'مریم سادات حسینی', 'COUNCIL', 'pos-5', 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150', '09125556677', now);
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

  // 6. Seed Projects & attach to workflow
  const prjCount = (db.prepare('SELECT count(*) as count FROM projects').get() as any).count;
  if (prjCount === 0) {
    const insertPrj = db.prepare(`
      INSERT INTO projects (
        id, title, code, description, productionType, location, deadline, budgetEstimated,
        status, majorityResult, requirementsJson, createdById, workflowId, currentStepOrder, currentPositionId, createdAt, updatedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'wf-standard', ?, ?, ?, ?)
    `);

    const req1 = JSON.stringify({ cameraman_count: '3', director_count: '1', producer_count: '1', host_count: '0', lighting_count: '2', sound_count: '2', transport_count: '2', support_count: '3', editor_count: '2', photographer_count: '1' });
    const req2 = JSON.stringify({ cameraman_count: '4', director_count: '1', producer_count: '1', host_count: '2', lighting_count: '3', sound_count: '2', transport_count: '3', support_count: '4', editor_count: '1', photographer_count: '1' });
    const req3 = JSON.stringify({ cameraman_count: '2', director_count: '1', producer_count: '1', host_count: '0', lighting_count: '1', sound_count: '1', transport_count: '1', support_count: '1', editor_count: '1', photographer_count: '1' });

    insertPrj.run('prj-101', 'مستند تاریخی شکوه زاگرس (فصل دوم)', 'PRJ-1403-01', 'مستند فاخر ۱۰ قسمتی پیرامون طبیعت و تاریخ فلات مرکزی.', 'مستند میدانی و هوایی', 'استان لرستان و چهارمحال', '۱۴۰۳/۰۹/۱۵', '۱٬۲۰۰٬۰۰۰٬۰۰۰ تومان', 'IN_REVIEW', 'APPROVED', req1, 'usr-admin', 4, 'pos-1', now, now);
    insertPrj.run('prj-102', 'برنامه گفتگومحور نگاه نو (ویژه شبکه یک)', 'PRJ-1403-02', 'برنامه ترکیبی زنده هفتگی با حضور کارشناسان ارشد فناوری.', 'برنامه استودیویی زنده', 'استودیو شماره ۱ جام جم', '۱۴۰۳/۰۹/۲۰', '۸۵۰٬۰۰۰٬۰۰۰ تومان', 'IN_REVIEW', 'NEEDS_REVISION', req2, 'usr-admin', 2, 'pos-2', now, now);
    insertPrj.run('prj-103', 'مجموعه کوتاه داستانی رهسپار', 'PRJ-1403-03', 'مجموعه کوتاه درام با محوریت مهارت‌های زندگی و خانواده ایرانی.', 'سریال کوتاه داستانی', 'تهران و حومه', '۱۴۰۳/۰۹/۲۵', '۶۰۰٬۰۰۰٬۰۰۰ تومان', 'IN_REVIEW', 'PENDING', req3, 'usr-admin', 1, 'pos-3', now, now);

    // Votes
    const insertVote = db.prepare('INSERT INTO votes (id, projectId, userId, status, reason, votedAt) VALUES (?, ?, ?, ?, ?, ?)');
    insertVote.run('vot-1', 'prj-101', 'usr-rezaei', 'APPROVED', 'طرح فیلمنامه غنی و تیم فنی کاملاً متناسب با حجم لوکیشن‌های کوهستانی است.', now);
    insertVote.run('vot-2', 'prj-101', 'usr-tehrani', 'APPROVED', 'تجهیزات تصویربرداری و تعداد صدابرداران تایید می‌گردد.', now);
    insertVote.run('vot-3', 'prj-101', 'usr-hoseini', 'NEEDS_REVISION', 'تعداد نفرات ترابری و برآورد بنزین نیازمند بازبینی و کاهش حدود ۱۵ درصدی است.', now);

    insertVote.run('vot-4', 'prj-102', 'usr-rezaei', 'NEEDS_REVISION', 'حضور دو مجری همزمان برای این فرمت مناسب نیست؛ درخواست تقلیل به ۱ مجری.', now);
    insertVote.run('vot-5', 'prj-102', 'usr-tehrani', 'NEEDS_REVISION', 'تعداد ۴ تصویربردار برای یک استودیوی گفتگومحور مازاد است.', now);
    insertVote.run('vot-6', 'prj-102', 'usr-moradi', 'REJECTED', 'همپوشانی موضوعی با برنامه قبلی دارد.', now);

    // Seed Initial Workflow Transition Logs
    const insertLog = db.prepare(`
      INSERT INTO workflow_logs (id, projectId, stepOrder, fromUserId, toPositionId, action, comment, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertLog.run('log-1', 'prj-101', 1, 'usr-tehrani', 'pos-2', 'FORWARDED', 'تجهیزات و عوامل فنی بازبینی و تایید اولیه شد. ارجاع به ناظر محتوایی.', now);
    insertLog.run('log-2', 'prj-101', 2, 'usr-rezaei', 'pos-5', 'FORWARDED', 'چارچوب محتوایی و فیلمنامه ۱۰ قسمت تایید گردید. ارجاع به امور مالی.', now);
    insertLog.run('log-3', 'prj-101', 3, 'usr-hoseini', 'pos-1', 'FORWARDED', 'برآورد کلی بررسی و جهت رای‌گیری نهایی به دبیرخانه شورا ارسال شد.', now);
  }
}

export { db };
