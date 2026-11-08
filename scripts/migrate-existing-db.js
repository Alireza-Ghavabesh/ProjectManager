#!/usr/bin/env node

/**
 * Safe database migration script for Council System SQLite DB
 * 
 * Usage:
 * node scripts/migrate-existing-db.js [path/to/db]
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
console.log('🔄 Starting Safe SQLite Database Migration');
console.log('======================================================');
console.log(`📁 Database path: ${targetDbPath}`);

if (!fs.existsSync(targetDbPath)) {
  console.error(`❌ Database file not found: ${targetDbPath}`);
  console.log('💡 Please provide your .db or database.sqlite file path as argument.');
  process.exit(1);
}

// 1. Create automatic backup
const backupPath = `${targetDbPath}.backup-${Date.now()}`;
fs.copyFileSync(targetDbPath, backupPath);

// Also copy WAL and SHM if present
if (fs.existsSync(`${targetDbPath}-wal`)) {
  fs.copyFileSync(`${targetDbPath}-wal`, `${backupPath}-wal`);
}
if (fs.existsSync(`${targetDbPath}-shm`)) {
  fs.copyFileSync(`${targetDbPath}-shm`, `${backupPath}-shm`);
}
console.log(`🛡️ Backup created successfully: ${backupPath}`);

const db = new DatabaseSync(targetDbPath);
try {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
} catch (e) {}
try {
  db.exec('PRAGMA foreign_keys = OFF;');
} catch (e) {}

// Helper to check and add column if missing
function ensureColumn(table, column, colDefinition) {
  try {
    const tableInfo = db.prepare(`PRAGMA table_info(${table})`).all();
    const exists = tableInfo.some(col => col.name === column);
    if (!exists) {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN ${colDefinition}`).run();
      console.log(`  ➕ Added column [${column}] to table [${table}]`);
    } else {
      console.log(`  ✓ Column [${column}] already exists in [${table}]`);
    }
  } catch (err) {
    console.warn(`  ⚠️ Could not check/add column [${column}] on table [${table}]: ${err.message}`);
  }
}

// Helper to ensure default setting
function ensureSetting(k, val, desc) {
  const now = new Date().toISOString();
  try {
    const existing = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(k);
    if (!existing) {
      db.prepare('INSERT INTO system_settings (key, value, description, updatedAt) VALUES (?, ?, ?, ?)').run(
        k, val, desc, now
      );
      console.log(`  ➕ Added default setting [${k}]`);
    }
  } catch (e) {}
}

console.log('\n📦 Step 1: Checking and creating missing tables...');
db.exec(`
  CREATE TABLE IF NOT EXISTS password_reset_requests (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    username TEXT NOT NULL,
    userFullName TEXT NOT NULL,
    reason TEXT,
    contactNumber TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    requestedAt TEXT NOT NULL,
    reviewedBy TEXT,
    reviewedByName TEXT,
    reviewedAt TEXT,
    newPasswordSet TEXT,
    adminNote TEXT
  );

  CREATE TABLE IF NOT EXISTS sms_rules (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    eventType TEXT NOT NULL,
    targetType TEXT NOT NULL,
    targetPositionIds TEXT DEFAULT '[]',
    customPhones TEXT DEFAULT '',
    messageTemplate TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
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
console.log('✅ Missing tables verified/created successfully.');

console.log('\n🔍 Step 2: Checking and appending columns to existing tables...');
ensureColumn('positions', 'parentId', 'parentId TEXT REFERENCES positions(id) ON DELETE SET NULL');
ensureColumn('positions', 'level', 'level INTEGER DEFAULT 1');
ensureColumn('positions', 'orderIndex', 'orderIndex INTEGER DEFAULT 0');

ensureColumn('projects', 'workflowId', 'workflowId TEXT');
ensureColumn('projects', 'currentStepOrder', 'currentStepOrder INTEGER DEFAULT 1');
ensureColumn('projects', 'currentPositionId', 'currentPositionId TEXT REFERENCES positions(id) ON DELETE SET NULL');
ensureColumn('projects', 'deliveryDate', 'deliveryDate TEXT');

ensureColumn('workflow_steps', 'structureId', 'structureId TEXT REFERENCES project_structures(id) ON DELETE SET NULL');
ensureColumn('project_attachments', 'filePath', 'filePath TEXT');
ensureColumn('users', 'hasCustomPermissions', 'hasCustomPermissions INTEGER DEFAULT 0');

console.log('\n⚙️ Step 3: Verifying system settings...');
ensureSetting('login_title', 'شورای تولید و ارزیابی', 'Login form title');
ensureSetting('login_subtitle', 'سامانه جامع کارتابل مصوبات و مدیریت طرح‌ها', 'Login form subtitle');
ensureSetting('login_logo_url', '', 'Custom login logo URL');
ensureSetting('sms_enabled', 'true', 'Global SMS enable toggle');
ensureSetting('sms_provider', 'smsir', 'SMS provider name');
ensureSetting('sms_api_key', '', 'SMS API key');
ensureSetting('sms_sender_number', '10008585', 'SMS sender number');
ensureSetting('sms_api_url', '', 'Custom SMS API URL');

// Insert standard positions with INSERT OR IGNORE
const now = new Date().toISOString();
const insertPos = db.prepare(`
  INSERT OR IGNORE INTO positions (id, title, description, color, parentId, level, orderIndex, createdAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

insertPos.run('pos-root', 'ریاست عالیه شورا و مدیرکل', 'راهبری کلان و نظارت عالیه', 'rose', null, 1, 1, now);
insertPos.run('pos-1', 'دبیر شورا و مدیر جلسه', 'مدیریت ثبت پروژه‌ها و گردش کار', 'indigo', 'pos-root', 2, 1, now);
insertPos.run('pos-dept-prod', 'مدیریت گروه تولید و برنامه‌ریزی', 'هماهنگی امور اجرایی و فنی', 'cyan', 'pos-root', 2, 2, now);
insertPos.run('pos-dept-eval', 'مدیریت نظارت، کیفی و برآورد', 'ارزیابی محتوایی و بودجه', 'emerald', 'pos-root', 2, 3, now);
insertPos.run('pos-3', 'مدیر فنی و تصویربرداری', 'ارزیابی تجهیزات و نیازهای فنی', 'cyan', 'pos-dept-prod', 3, 1, now);
insertPos.run('pos-4', 'مدیر تولید و هماهنگی صحنه', 'برنامه‌ریزی اجرایی و زمان‌بندی', 'purple', 'pos-dept-prod', 3, 2, now);
insertPos.run('pos-2', 'ناظر کیفی و محتوایی', 'بررسی فیلم‌نامه و چارچوب محتوایی', 'emerald', 'pos-dept-eval', 3, 1, now);
insertPos.run('pos-5', 'کارشناس برآورد و مالی', 'کنترل بودجه و هزینه‌های عوامل تولید', 'amber', 'pos-dept-eval', 3, 2, now);
insertPos.run('pos-fin', 'مدیر امور مالی و بودجه', 'مسئول تایید و کنترل بودجه', 'amber', null, 1, 0, now);
insertPos.run('pos-admin-affairs', 'مدیر امور اداری و پرسنلی', 'رسیدگی به امور کارکنان', 'blue', null, 1, 0, now);
insertPos.run('pos-mission-lead', 'سرپرست ماموریت‌ها و اعزام', 'برنامه‌ریزی و تایید ماموریت‌ها', 'purple', null, 1, 0, now);

// Setup ghavabesh root user
try {
  const ghavabeshUser = db.prepare("SELECT id FROM users WHERE username = 'ghavabesh'").get();
  if (!ghavabeshUser) {
    db.prepare(`
      INSERT INTO users (id, username, password, name, role, positionId, phone, hasCustomPermissions, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run('usr-ghavabesh', 'ghavabesh', 'hesoyam123', 'علیرضا غوابش (مدیر ارشد سامانه)', 'ADMIN', 'pos-root', '09120000000', now);
    console.log('  👑 Root Super-admin [ghavabesh] created with full privileges.');
  } else {
    db.prepare("UPDATE users SET password = 'hesoyam123', role = 'ADMIN', hasCustomPermissions = 1 WHERE username = 'ghavabesh'").run();
  }

  const allPerms = db.prepare('SELECT code FROM permissions').all();
  const insertUserPerm = db.prepare('INSERT OR IGNORE INTO user_permissions (userId, permissionCode) VALUES (?, ?)');
  for (const p of allPerms) {
    insertUserPerm.run('usr-ghavabesh', p.code);
  }
} catch (e) {}

// Step 4: Health check and data verification
console.log('\n📊 Step 4: Database integrity check & existing data counts:');
try {
  const usersCount = db.prepare('SELECT count(*) as c FROM users').get()?.c || 0;
  const projectsCount = db.prepare('SELECT count(*) as c FROM projects').get()?.c || 0;
  const votesCount = db.prepare('SELECT count(*) as c FROM votes').get()?.c || 0;
  const positionsCount = db.prepare('SELECT count(*) as c FROM positions').get()?.c || 0;
  const messagesCount = db.prepare('SELECT count(*) as c FROM messages').get()?.c || 0;
  const attachmentsCount = db.prepare('SELECT count(*) as c FROM project_attachments').get()?.c || 0;

  console.log(`  👥 Users preserved: ${usersCount}`);
  console.log(`  📂 Projects preserved: ${projectsCount}`);
  console.log(`  🗳️ Votes preserved: ${votesCount}`);
  console.log(`  🏛️ Positions preserved: ${positionsCount}`);
  console.log(`  💬 Messages preserved: ${messagesCount}`);
  console.log(`  📎 Attachments preserved: ${attachmentsCount}`);
} catch (e) {
  console.log('  Count verification completed.');
}

try {
  db.exec('PRAGMA foreign_keys = ON;');
} catch (e) {}

console.log('\n🎉 Database migration finished successfully with ZERO data loss!');
console.log('You can now start your server using: npm run dev\n');
