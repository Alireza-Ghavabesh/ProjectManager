import { envFilePortRaw } from './src/server/loadEnv.js';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase, activeDbPath } from './src/server/db.js';
import { apiRouter } from './src/server/routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize SQLite database and seed initial data
initDatabase();

function parseValidPort(raw: string | undefined): number | null {
  if (!raw) return null;
  const p = parseInt(raw.trim(), 10);
  if (!Number.isFinite(p) || p < 1 || p > 65535) return null;
  return p;
}

function getPort(): { port: number; source: string } {
  const portArgIndex = process.argv.indexOf('--port');
  if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
    const cliPort = parseValidPort(process.argv[portArgIndex + 1]);
    if (cliPort !== null) return { port: cliPort, source: 'CLI --port' };
  }

  // Always honor PORT explicitly configured in .env / .env.local (including 8080)
  const filePort = parseValidPort(envFilePortRaw);
  if (filePort !== null) {
    return { port: filePort, source: '.env' };
  }

  // Honor OS/shell PORT (except Cloud Run's injected 8080 during AI Studio dev preview)
  const osPort = parseValidPort(process.env.PORT);
  const isAiStudioDevPreview =
    Boolean(process.env.K_SERVICE) && process.env.NODE_ENV !== 'production';
  if (osPort !== null && !(isAiStudioDevPreview && osPort === 8080)) {
    return { port: osPort, source: 'process.env.PORT' };
  }

  return { port: 3000, source: 'default' };
}

const { port: PRIMARY_PORT, source: PORT_SOURCE } = getPort();

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve public directory explicitly with proper PWA & Service Worker headers
app.use(express.static(path.resolve(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('sw.js')) {
      res.setHeader('Service-Worker-Allowed', '/');
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    }
    if (filePath.endsWith('.webmanifest')) {
      res.setHeader('Content-Type', 'application/manifest+json');
    }
  }
}));

// API Routes
app.use('/api', apiRouter);

async function startServer() {
  const httpServer = http.createServer(app);

  const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--production') || process.argv.includes('--prod');

  if (isProduction) {
    app.use((req, res, next) => {
      if (/\.db(-wal|-shm)?$/i.test(req.path)) {
        return res.status(403).end();
      }
      next();
    });
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    // Mount Vite dev server middleware
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PRIMARY_PORT, '0.0.0.0', () => {
    console.log(
      `Council System server running on http://0.0.0.0:${PRIMARY_PORT} (port source: ${PORT_SOURCE}, mode: ${isProduction ? 'production' : 'development'}, db: ${activeDbPath})`
    );
  });
}

startServer();
