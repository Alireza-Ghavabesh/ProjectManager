#!/usr/bin/env node

/**
 * SQLite Database Backup Restoration Script
 * 
 * Usage:
 * 1. List available backups:
 *    npm run restore:db -- --list
 * 
 * 2. Restore the latest backup automatically:
 *    npm run restore:db
 * 
 * 3. Restore a specific backup file:
 *    npm run restore:db -- council.db.backup-1794076647710
 */

import fs from 'fs';
import path from 'path';

const projectRoot = process.cwd();
const targetDbName = 'council.db';
const targetDbPath = path.resolve(projectRoot, targetDbName);

// Find all backup files in root directory
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
console.log('📦 SQLite Database Backup Restore Utility');
console.log('======================================================\n');

if (args.includes('--list') || args.includes('-l')) {
  if (backupFiles.length === 0) {
    console.log('⚠️ No backup files found in project directory.');
  } else {
    console.log(`📋 Available backups (${backupFiles.length} files found):`);
    backupFiles.forEach((b, idx) => {
      console.log(`  [${idx + 1}] ${b.name} (${b.size}) - Date: ${b.mtime.toISOString()}`);
    });
    console.log('\n💡 To restore any backup, run:');
    console.log(`   npm run restore:db -- ${backupFiles[0].name}`);
  }
  process.exit(0);
}

// Select backup file
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
    console.error(`❌ Specified backup file not found: ${specificFile}`);
    console.log('💡 To list available backups, run:');
    console.log('   npm run restore:db -- --list');
    process.exit(1);
  }
} else {
  if (backupFiles.length === 0) {
    console.error('❌ No backup files found!');
    console.log('Please check if any council.db.backup-* file exists in your project directory.');
    process.exit(1);
  }
  selectedBackup = backupFiles[0];
}

console.log(`🎯 Selected backup for restoration: ${selectedBackup.name}`);

// Create safety copy of current db before replacing
if (fs.existsSync(targetDbPath)) {
  const emergencyBackup = `${targetDbPath}.safety-before-restore-${Date.now()}`;
  fs.copyFileSync(targetDbPath, emergencyBackup);
  console.log(`🛡️ Safety copy of current database saved to:\n   ${path.basename(emergencyBackup)}`);
}

// Clean up current WAL and SHM files
const walPath = `${targetDbPath}-wal`;
const shmPath = `${targetDbPath}-shm`;
if (fs.existsSync(walPath)) try { fs.unlinkSync(walPath); } catch (e) {}
if (fs.existsSync(shmPath)) try { fs.unlinkSync(shmPath); } catch (e) {}

// Copy backup file over target db
fs.copyFileSync(selectedBackup.path, targetDbPath);

// Also copy wal and shm if present in backup
if (fs.existsSync(`${selectedBackup.path}-wal`)) {
  fs.copyFileSync(`${selectedBackup.path}-wal`, walPath);
}
if (fs.existsSync(`${selectedBackup.path}-shm`)) {
  fs.copyFileSync(`${selectedBackup.path}-shm`, shmPath);
}

console.log('\n✅ Database successfully restored to the selected backup!');
console.log('📁 council.db is now active with your restored data.');
console.log('🚀 You can now start the application with:');
console.log('   npm run dev\n');
