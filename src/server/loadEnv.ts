import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const projectRoot = path.resolve(__dirname, '../../');

let envFilePortRaw: string | undefined;

for (const filename of ['.env', '.env.local']) {
  const candidatePaths = Array.from(
    new Set([path.resolve(projectRoot, filename), path.resolve(process.cwd(), filename)])
  );
  for (const envPath of candidatePaths) {
    if (fs.existsSync(envPath)) {
      const parsed = dotenv.config({ path: envPath, override: true }).parsed;
      const rawPort = parsed?.PORT ?? parsed?.['\uFEFFPORT'];
      if (rawPort && rawPort.trim()) {
        envFilePortRaw = rawPort.trim();
      }
    }
  }
}

export { envFilePortRaw };
