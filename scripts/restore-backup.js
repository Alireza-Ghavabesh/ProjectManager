#!/usr/bin/env node

/**
 * اسکریپت بازیابی بک‌آپ‌های دیتابیس سامانه شورای ارزیابی
 * 
 * نحوه استفاده:
 * 1. لیست کردن تمام بک‌آپ‌های موجود:
 *    npm run restore:db -- --list
 * 
 * 2. بازیابی آخرین بک‌آپ موجود:
 *    npm run restore:db
 * 
 * 3. بازیابی یک فایل بک‌آپ خاص:
 *    npm run restore:db -- council.db.backup-1794076647710
 */

import fs from 'fs';
import path from 'path';

const projectRoot = process.cwd();
const targetDbName = 'council.db';
const targetDbPath = path.resolve(projectRoot, targetDbName);

// پیدا کردن تمام فایل‌های بک‌آپ در ریشه پروژه
const files = fs.readdirSync(projectRoot);
const backupFiles = files.filter(f => 
  (f.startsWith('council.db.backup-') || f.startsWith('database.sqlite.backup-') || f.includes('.backup')) &&
  !f.endsWith('-wal') && !f.endsWith('-shm')
).map(f => {
  const fullPath = path.resolve(projectRoot, f);
  const stat = fs.statSync(fullPath);
  return {
    name: f,
    path: fullPath,
    size: (stat.size / 1024).toFixed(1) + ' KB',
    mtime: stat.mtime
  };
}).sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

const args = process.argv.slice(2);

console.log('======================================================');
console.log('📦 مدیریت و بازیابی نسخه‌های پشتیبان دیتابیس (Restore)');
console.log('======================================================\n');

if (args.includes('--list') || args.includes('-l')) {
  if (backupFiles.length === 0) {
    console.log('⚠️ هیچ فایل بک‌آپی در پوشه پروژه یافت نشد.');
  } else {
    console.log(`📋 لیست فایل‌های بک‌آپ موجود (${backupFiles.length} نسخه):`);
    backupFiles.forEach((b, idx) => {
      console.log(`  [${idx + 1}] ${b.name} (${b.size}) - تاریخ: ${b.mtime.toLocaleString('fa-IR')}`);
    });
    console.log('\n💡 برای بازیابی هر کدام، دستور زیر را اجرا کنید:');
    console.log(`   npm run restore:db -- ${backupFiles[0].name}`);
  }
  process.exit(0);
}

// انتخاب فایل بک‌آپ برای بازیابی
let selectedBackup = null;
const specificFile = args.find(a => !a.startsWith('-'));

if (specificFile) {
  const customPath = path.isAbsolute(specificFile) ? specificFile : path.resolve(projectRoot, specificFile);
  if (fs.existsSync(customPath)) {
    selectedBackup = {
      name: path.basename(customPath),
      path: customPath
    };
  } else {
    console.error(`❌ فایل بک‌آپ مشخص‌شده یافت نشد: ${specificFile}`);
    console.log('💡 برای دیدن لیست بک‌آپ‌های موجود دستور زیر را بزنید:');
    console.log('   npm run restore:db -- --list');
    process.exit(1);
  }
} else {
  // استفاده از جدیدترین بک‌آپ به صورت خودکار
  if (backupFiles.length === 0) {
    console.error('❌ هیچ فایل بک‌آپی یافت نشد!');
    console.log('بررسی کنید آیا فایل بک‌آپی با نام council.db.backup-* وجود دارد یا خیر.');
    process.exit(1);
  }
  selectedBackup = backupFiles[0];
}

console.log(`🎯 نسخه انتخاب‌شده جهت بازیابی: ${selectedBackup.name}`);

// پیش از جایگزینی، یک کپی ایمنی از وضعیت فعلی council.db می‌گیریم
if (fs.existsSync(targetDbPath)) {
  const emergencyBackup = `${targetDbPath}.safety-before-restore-${Date.now()}`;
  fs.copyFileSync(targetDbPath, emergencyBackup);
  console.log(`🛡️ جهت اطمینان، از دیتابیس فعلی نسخه ایمنی تهیه شد:\n   ${path.basename(emergencyBackup)}`);
}

// پاکسازی فایل‌های WAL و SHM فعلی تا دیتابیس جدید بی‌نقص جایگزین شود
const walPath = `${targetDbPath}-wal`;
const shmPath = `${targetDbPath}-shm`;
if (fs.existsSync(walPath)) try { fs.unlinkSync(walPath); } catch (e) {}
if (fs.existsSync(shmPath)) try { fs.unlinkSync(shmPath); } catch (e) {}

// کپی فایل بک‌آپ بر روی council.db
fs.copyFileSync(selectedBackup.path, targetDbPath);

// همچنین کپی فایل‌های wal و shm بک‌آپ در صورت وجود
if (fs.existsSync(`${selectedBackup.path}-wal`)) {
  fs.copyFileSync(`${selectedBackup.path}-wal`, walPath);
}
if (fs.existsSync(`${selectedBackup.path}-shm`)) {
  fs.copyFileSync(`${selectedBackup.path}-shm`, shmPath);
}

console.log('\n✅ دیتابیس با موفقیت به نسخه پشتیبان انتخابی شما بازگردانده شد!');
console.log('📁 فایل council.db اکنون حاوی اطلاعات نسخه بک‌آپ است.');
console.log('🚀 اکنون می‌توانید سامانه را با دستور زیر اجرا فرمایید:');
console.log('   npm run dev\n');
