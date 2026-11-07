#!/usr/bin/env node

/**
 * اسکریپت ساخت یا ارتقای کاربر با دسترسی کامل (Super Admin)
 * 
 * نحوه اجرا:
 * npm run createUser -- --username=ghavabesh --password=hesoyam123
 * یا:
 * npm run createUser -- --username ghavabesh --password hesoyam123 --name "علیرضا غوابش"
 * یا به صورت خلاصه:
 * npm run createUser ghavabesh hesoyam123
 */

import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

// Helper to generate offline SVG avatar
function generateOfflineAvatarSvg(name, id) {
  const initials = (name || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('');

  const colors = [
    ['#4f46e5', '#3730a3'],
    ['#059669', '#047857'],
    ['#dc2626', '#b91c1c'],
    ['#d97706', '#b45309'],
    ['#7c3aed', '#6d28d9'],
    ['#0284c7', '#0369a1'],
    ['#e11d48', '#be123c'],
  ];

  let hash = 0;
  for (let i = 0; i < (id || name || 'x').length; i++) {
    hash = (hash * 31 + (id || name).charCodeAt(i)) % colors.length;
  }
  const [c1, c2] = colors[Math.abs(hash)];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
    <defs>
      <linearGradient id="grad-${hash}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c1}" />
        <stop offset="100%" stop-color="${c2}" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" rx="28" fill="url(#grad-${hash})" />
    <text x="50" y="58" font-family="system-ui, -apple-system, sans-serif" font-size="34" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${initials || 'U'}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Parse command line arguments
const args = process.argv.slice(2);
let username = '';
let password = '';
let name = '';
let role = 'ADMIN'; // پیش‌فرض فول دسترسی (کاربر ارشد)
let phone = '09120000000';
let dbPath = '';

const positionalArgs = [];

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg.startsWith('--username=')) {
    username = arg.split('=')[1];
  } else if (arg === '--username' || arg === '-u') {
    username = args[++i] || '';
  } else if (arg.startsWith('--password=')) {
    password = arg.split('=')[1];
  } else if (arg === '--password' || arg === '-p') {
    password = args[++i] || '';
  } else if (arg.startsWith('--name=')) {
    name = arg.split('=')[1];
  } else if (arg === '--name' || arg === '-n') {
    name = args[++i] || '';
  } else if (arg.startsWith('--role=')) {
    role = arg.split('=')[1].toUpperCase();
  } else if (arg === '--role' || arg === '-r') {
    role = (args[++i] || 'ADMIN').toUpperCase();
  } else if (arg.startsWith('--phone=')) {
    phone = arg.split('=')[1];
  } else if (arg === '--phone') {
    phone = args[++i] || '';
  } else if (arg.startsWith('--db=')) {
    dbPath = arg.split('=')[1];
  } else if (arg === '--db') {
    dbPath = args[++i] || '';
  } else if (!arg.startsWith('-')) {
    positionalArgs.push(arg);
  }
}

// Fallback to positional arguments if not specified via flags
if (!username && positionalArgs[0]) username = positionalArgs[0];
if (!password && positionalArgs[1]) password = positionalArgs[1];
if (!name && positionalArgs[2]) name = positionalArgs[2];
if (positionalArgs[3]) role = positionalArgs[3].toUpperCase();

if (!username || !password) {
  console.log('======================================================');
  console.log('❌ خطا: نام کاربری یا رمز عبور مشخص نشده است.');
  console.log('======================================================');
  console.log('\n📖 نحوه استفاده:');
  console.log('  npm run createUser -- --username=<نام_کاربری> --password=<رمز_عبور>');
  console.log('\n💡 مثال‌ها:');
  console.log('  npm run createUser -- --username=ghavabesh --password=hesoyam123');
  console.log('  npm run createUser -- --username=ghavabesh --password=hesoyam123 --name="علیرضا غوابش"');
  console.log('  npm run createUser ghavabesh hesoyam123');
  console.log('======================================================\n');
  process.exit(1);
}

// Resolve SQLite Database path
if (!dbPath) {
  if (fs.existsSync(path.resolve(process.cwd(), 'council.db'))) {
    dbPath = path.resolve(process.cwd(), 'council.db');
  } else if (fs.existsSync(path.resolve(process.cwd(), 'database.sqlite'))) {
    dbPath = path.resolve(process.cwd(), 'database.sqlite');
  } else {
    dbPath = path.resolve(process.cwd(), 'council.db');
  }
}

console.log('======================================================');
console.log('👤 ایجاد / ویرایش کاربر ارشد سامانه (Full Access)');
console.log('======================================================');
console.log(`📁 فایل دیتابیس: ${dbPath}`);
console.log(`🔑 نام کاربری: ${username}`);
console.log(`🛡️ سطح دسترسی: ${role} (کاربر ارشد با دسترسی کامل)`);

if (!fs.existsSync(dbPath)) {
  console.error(`❌ فایل دیتابیس یافت نشد: ${dbPath}`);
  process.exit(1);
}

const db = new DatabaseSync(dbPath);

try {
  db.exec('PRAGMA foreign_keys = OFF;'); // موقتاً غیرفعال برای درج ایمن
} catch (e) {}

const now = new Date().toISOString();
const displayName = name || username;

// Check which position to link (pos-root or pos-1)
let positionId = null;
try {
  const rootPos = db.prepare("SELECT id FROM positions WHERE id = 'pos-root'").get();
  if (rootPos) {
    positionId = 'pos-root';
  } else {
    const pos1 = db.prepare("SELECT id FROM positions WHERE id = 'pos-1'").get();
    if (pos1) positionId = 'pos-1';
  }
} catch (e) {}

// Check if user already exists
const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
let userId = '';

if (existingUser) {
  userId = existingUser.id;
  db.prepare(`
    UPDATE users 
    SET password = ?, 
        role = ?, 
        name = COALESCE(?, name),
        hasCustomPermissions = 1,
        positionId = COALESCE(?, positionId)
    WHERE username = ?
  `).run(password, role, displayName, positionId, username);
  console.log(`✅ کاربر موجود «${username}» با رمز عبور و دسترسی ارشد جدید به‌روزرسانی شد.`);
} else {
  userId = `usr-${username.toLowerCase().replace(/[^a-z0-9_-]/g, '') || Date.now()}`;
  const avatar = generateOfflineAvatarSvg(displayName, userId);
  
  db.prepare(`
    INSERT INTO users (id, username, password, name, role, positionId, avatar, phone, hasCustomPermissions, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(userId, username, password, displayName, role, positionId, avatar, phone, now);
  console.log(`✨ کاربر جدید «${username}» با شناسه «${userId}» ایجاد گردید.`);
}

// Grant ALL system permissions to this user in user_permissions table
let grantedCount = 0;
try {
  const allPerms = db.prepare('SELECT code FROM permissions').all();
  const insertUserPerm = db.prepare('INSERT OR IGNORE INTO user_permissions (userId, permissionCode) VALUES (?, ?)');
  for (const p of allPerms) {
    insertUserPerm.run(userId, p.code);
    grantedCount++;
  }
} catch (e) {
  // If permissions table doesn't exist yet, it's fine since role is ADMIN
}

try {
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
} catch (e) {}

console.log('------------------------------------------------------');
console.log(`🎉 کاربر «${username}» با موفقیت ثبت شد!`);
console.log(`🔐 نام کاربری: ${username}`);
console.log(`🔑 کلمه عبور: ${password}`);
console.log(`👑 نقش: ${role} (دسترسی نامحدود به تمامی بخش‌ها و منوها)`);
if (grantedCount > 0) {
  console.log(`⭐ تعداد ${grantedCount} مجوز سیستمی به صورت اختصاصی به این کاربر تخصیص یافت.`);
}
console.log('======================================================');
console.log('اکنون می‌توانید با این مشخصات وارد سامانه شوید.');
