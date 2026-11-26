import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const sourceDbPath = path.join(projectRoot, 'council.db');
const buildDataDir = path.join(projectRoot, 'build-data');
const targetDbPath = path.join(buildDataDir, 'council.db');

if (!fs.existsSync(sourceDbPath)) {
  console.log('[build-db] No dev council.db found at project root; skipping database copy.');
  process.exit(0);
}

fs.mkdirSync(buildDataDir, { recursive: true });

// Remove any stale WAL/SHM or old DB file before creating a clean snapshot
for (const suffix of ['', '-wal', '-shm']) {
  const stalePath = `${targetDbPath}${suffix}`;
  if (fs.existsSync(stalePath)) {
    fs.unlinkSync(stalePath);
  }
}

const tempTargetPath = path.join(buildDataDir, `.council-build-${Date.now()}.db`);

try {
  const srcDb = new DatabaseSync(sourceDbPath);
  try {
    srcDb.exec('PRAGMA busy_timeout = 5000;');
    const escapedTarget = tempTargetPath.replace(/'/g, "''");
    srcDb.exec(`VACUUM INTO '${escapedTarget}'`);
  } finally {
    srcDb.close();
  }

  fs.renameSync(tempTargetPath, targetDbPath);
  const sizeKb = Math.round(fs.statSync(targetDbPath).size / 1024);
  console.log(`[build-db] Copied dev database to build-data/council.db (${sizeKb} KB, WAL-merged snapshot).`);
} catch (err) {
  if (fs.existsSync(tempTargetPath)) {
    try {
      fs.unlinkSync(tempTargetPath);
    } catch {}
  }
  console.error('[build-db] Failed to copy dev database for build:', err);
  process.exit(1);
}
