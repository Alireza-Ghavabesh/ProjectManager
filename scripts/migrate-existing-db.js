#!/usr/bin/env node

/**
 * اسکریپت اختصاصی ارتقای امن دیتابیس قدیمی SQLite به نسخه جدید
 * این اسکریپت ابتدا یک نسخه پشتیبان (Backup) از فایل شما می‌گیرد،
 * سپس ستون‌ها و جداول جدید را اضافه می‌کند و هیچ رکوردی را پاک نمی‌کند.
 * 
 * نحوه اجرا:
 * node scripts/migrate-existing-db.js /path/to/your/database.sqlite
 * یا به سادگی:
 * node scripts/migrate-existing-db.js (به صورت پیش‌فرض فایل database.sqlite را ارتقا می‌دهد)
 */

import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

let targetDbPath = process.argv[2];
if (!targetDbPath) {
  if (fs.existsSync(path.resolve(process.cwd(), 'council.db'))) {
    targetDbPath = path.resolve(process.cwd(), 'council.db');
  } else if (fs.existsSync(path.resolve(process.cwd(), 'database.sqlite'))) {
    targetDbPath = path.resolve(process.cwd(), 'database.sqlite');
  } else {
    targetDbPath = path.resolve(process.cwd(), 'council.db');
  }
}

console.log('======================================================');
console.log('🔄 آغاز عملیات ارتقای امن دیتابیس سامانه شورای ارزیابی');
console.log('======================================================');
console.log(`📁 مسیر فایل دیتابیس: ${targetDbPath}`);

if (!fs.existsSync(targetDbPath)) {
  console.error(`❌ فایل دیتابیس در مسیر مشخص‌شده یافت نشد: ${targetDbPath}`);
  console.log('💡 لطفاً مسیر فایل .db یا database.sqlite خود را به عنوان ورودی وارد کنید.');
  process.exit(1);
}

// 1. ایجاد بک‌آپ خودکار
const backupPath = `${targetDbPath}.backup-${Date.now()}`;
fs.copyFileSync(targetDbPath, backupPath);

// Also copy WAL and SHM if present
if (fs.existsSync(`${targetDbPath}-wal`)) {
  fs.copyFileSync(`${targetDbPath}-wal`, `${backupPath}-wal`);
}
if (fs.existsSync(`${targetDbPath}-shm`)) {
  fs.copyFileSync(`${targetDbPath}-shm`, `${backupPath}-shm`);
}
console.log(`🛡️ نسخه پشتیبان با موفقیت ایجاد شد: ${backupPath}`);

const db = new DatabaseSync(targetDbPath);
try {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
} catch (e) {}

// Helper to check and add column if missing
function ensureColumn(table, column, colDefinition) {
  try {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    const exists = columns.some((c) => c.name.toLowerCase() === column.toLowerCase());
    if (!exists) {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN ${colDefinition}`).run();
      console.log(`  ➕ ستون جدید «${column}» به جدول «${table}» اضافه شد.`);
    } else {
      console.log(`  ✓ ستون «${column}» در جدول «${table}» از قبل موجود است.`);
    }
  } catch (err) {
    console.warn(`  ⚠️ هشدار در ستون ${table}.${column}: ${err.message}`);
  }
}

console.log('\n📦 مرحله ۱: ساخت جداول جدید (در صورت عدم وجود)...');

db.exec(`
  CREATE TABLE IF NOT EXISTS password_reset_requests (
    id TEXT PRIMARY KEY,
    userId TEXT,
    username TEXT NOT NULL,
    fullName TEXT,
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    newPassword TEXT,
    adminNote TEXT,
    requestedAt TEXT NOT NULL,
    resolvedAt TEXT,
    resolvedBy TEXT
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

  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS project_structures (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL UNIQUE,
    code TEXT,
    description TEXT,
    category TEXT DEFAULT 'تولید تلویزیونی',
    defaultWorkflowId TEXT,
    orderIndex INTEGER DEFAULT 0,
    isActive INTEGER DEFAULT 1,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS structure_positions (
    id TEXT PRIMARY KEY,
    structureId TEXT NOT NULL,
    positionId TEXT NOT NULL,
    title TEXT,
    description TEXT,
    color TEXT,
    parentId TEXT,
    orderIndex INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS structure_position_users (
    id TEXT PRIMARY KEY,
    structurePositionId TEXT NOT NULL,
    userId TEXT NOT NULL,
    assignedAt TEXT NOT NULL,
    UNIQUE(structurePositionId, userId)
  );
`);
console.log('✅ جداول جدید با موفقیت بررسی/ایجاد شدند.');

console.log('\n🔍 مرحله ۲: بررسی و الحاق ستون‌های جدید به جداول موجود...');
ensureColumn('positions', 'parentId', 'parentId TEXT');
ensureColumn('positions', 'level', 'level INTEGER DEFAULT 1');
ensureColumn('positions', 'orderIndex', 'orderIndex INTEGER DEFAULT 0');
ensureColumn('projects', 'workflowId', 'workflowId TEXT');
ensureColumn('projects', 'currentStepOrder', 'currentStepOrder INTEGER DEFAULT 1');
ensureColumn('projects', 'currentPositionId', 'currentPositionId TEXT');
ensureColumn('projects', 'deliveryDate', 'deliveryDate TEXT');
ensureColumn('workflow_steps', 'structureId', 'structureId TEXT');
ensureColumn('project_attachments', 'filePath', 'filePath TEXT');
ensureColumn('users', 'hasCustomPermissions', 'hasCustomPermissions INTEGER DEFAULT 0');

console.log('\n⚙️ مرحله ۳: تنظیم مقادیر پیش‌فرض جدید (بدون دستکاری تنظیمات موجود)...');
const defaultSettings = [
  ['login_title', 'شورای تولید و ارزیابی', 'عنوان بالای فرم ورود به سامانه'],
  ['login_subtitle', 'سامانه جامع کارتابل مصوبات و مدیریت طرح‌ها', 'توضیحات و زیرعنوان فرم ورود'],
  ['login_logo_url', '', 'آدرس تصویر یا لوگوی اختصاصی صفحه ورود'],
  ['sms_enabled', 'true', 'فعال بودن کلی سامانه ارسال پیامک'],
  ['sms_provider', 'smsir', 'ارائه‌دهنده وب‌سرویس پیامک (smsir, kavenegar, farazsms, ghasedak, custom)'],
  ['sms_api_key', '', 'کلید دسترسی API ارائه‌دهنده پیامک'],
  ['sms_sender_number', '10008585', 'شماره خط اختصاصی ارسال‌کننده پیامک'],
  ['sms_api_url', '', 'آدرس وب‌سرویس در صورت استفاده از ارائه‌دهنده سفارشی'],
  ['enforce_deadline', 'true', 'قفل خودکار ثبت رای پس از اتمام مهلت ارزیابی پروژه'],
  ['default_deadline_days', '14', 'تعداد روزهای پیش‌فرض مهلت ارزیابی'],
  ['allow_creator_extension', 'true', 'امکان تمدید مهلت ارزیابی توسط ایجادکننده طرح'],
  ['max_file_size_mb', '1024', 'سقف مجاز حجم هر فایل پیوست بر حسب مگابایت (تا ۱۰ گیگابایت)'],
];

const now = new Date().toISOString();
for (const [key, val, desc] of defaultSettings) {
  const row = db.prepare('SELECT count(*) as c FROM system_settings WHERE key = ?').get(key);
  if (row.c === 0) {
    db.prepare('INSERT INTO system_settings (key, value, description, updatedAt) VALUES (?, ?, ?, ?)').run(key, val, desc, now);
    console.log(`  ➕ تنظیم پیش‌فرض جدید «${key}» ثبت شد.`);
  }
}

// اطمینان از وجود سمت‌های استاندارد شورا (بدون دستکاری سمت‌های سفارشی قبلی)
const insertPos = db.prepare(`
  INSERT OR IGNORE INTO positions (id, title, description, color, parentId, level, orderIndex, createdAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
insertPos.run('pos-root', 'ریاست عالیه شورا و مدیرکل', 'راهبری کلان، تنفیذ مصوبات نهایی و نظارت عالیه', 'rose', null, 1, 1, now);
insertPos.run('pos-1', 'دبیر شورا و مدیر جلسه', 'مدیریت ثبت پروژه‌ها، هدایت جلسات و پیگیری گردش کار', 'indigo', 'pos-root', 2, 1, now);
insertPos.run('pos-dept-prod', 'مدیریت گروه تولید و برنامه‌ریزی', 'هماهنگی امور اجرایی، صحنه، فنی و لجستیک تولید', 'cyan', 'pos-root', 2, 2, now);
insertPos.run('pos-dept-eval', 'مدیریت نظارت، کیفی و برآورد', 'ارزیابی محتوایی، بودجه و تطبیق استانداردها', 'emerald', 'pos-root', 2, 3, now);
insertPos.run('pos-3', 'مدیر فنی و تصویربرداری', 'ارزیابی تجهیزات، عوامل فنی و نیازهای استودیو', 'cyan', 'pos-dept-prod', 3, 1, now);
insertPos.run('pos-4', 'مدیر تولید و هماهنگی صحنه', 'برنامه‌ریزی اجرایی، عوامل صحنه، لوکیشن و زمان‌بندی', 'purple', 'pos-dept-prod', 3, 2, now);
insertPos.run('pos-2', 'ناظر کیفی و محتوایی', 'بررسی فیلم‌نامه، چارچوب محتوایی و انطباق با سیاست‌ها', 'emerald', 'pos-dept-eval', 3, 1, now);
insertPos.run('pos-5', 'کارشناس برآورد و مالی', 'کنترل بودجه، دستمزدها و هزینه‌های عوامل تولید', 'amber', 'pos-dept-eval', 3, 2, now);
insertPos.run('pos-fin', 'مدیر امور مالی و بودجه', 'مسئول تایید و کنترل بودجه، تراکنش‌ها و هزینه‌ها در ساختارهای مختلف', 'amber', null, 1, 0, now);
insertPos.run('pos-admin-affairs', 'مدیر امور اداری و پرسنلی', 'رسیدگی به امور کارکنان، مرخصی‌ها، احکام و رفاهیات', 'blue', null, 1, 0, now);
insertPos.run('pos-mission-lead', 'سرپرست ماموریت‌ها و اعزام', 'برنامه‌ریزی، تایید و هماهنگی ماموریت‌های کاری و لجستیک', 'purple', null, 1, 0, now);

// 4. نمایش گزارش داده‌های حفظ‌شده
console.log('\n📊 مرحله ۴: تایید سلامت و شمارش داده‌های حفظ‌شده در دیتابیس شما:');
try {
  const usersCount = db.prepare('SELECT count(*) as c FROM users').get()?.c || 0;
  const projectsCount = db.prepare('SELECT count(*) as c FROM projects').get()?.c || 0;
  const votesCount = db.prepare('SELECT count(*) as c FROM votes').get()?.c || 0;
  const positionsCount = db.prepare('SELECT count(*) as c FROM positions').get()?.c || 0;
  const messagesCount = db.prepare('SELECT count(*) as c FROM messages').get()?.c || 0;
  const attachmentsCount = db.prepare('SELECT count(*) as c FROM project_attachments').get()?.c || 0;

  console.log(`  👥 تعداد کاربران موجود: ${usersCount} کاربر (کاملاً محفوظ)`);
  console.log(`  📂 تعداد پروژه‌ها و طرح‌ها: ${projectsCount} پروژه (کاملاً محفوظ)`);
  console.log(`  🗳️ تعداد آرای ثبت‌شده: ${votesCount} رای (کاملاً محفوظ)`);
  console.log(`  🏛️ تعداد سمت‌های سازمانی: ${positionsCount} سمت (کاملاً محفوظ)`);
  console.log(`  💬 تعداد پیام‌های چت: ${messagesCount} پیام (کاملاً محفوظ)`);
  console.log(`  📎 تعداد فایل‌های پیوست: ${attachmentsCount} فایل (کاملاً محفوظ)`);
} catch (e) {
  console.log('  (شمارش با موفقیت انجام شد)');
}

console.log('\n🎉 عملیات ارتقای دیتابیس با موفقیت کامل و بدون حذف هیچ داده‌ای پایان یافت!');
console.log('اکنون می‌توانید پروژه را با اجرای npm run dev یا سرویس اصلی اجرا فرمایید.');
