import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initDatabase } from './src/server/db.js';
import { apiRouter } from './src/server/routes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize SQLite database and seed initial data
initDatabase();

function getPort(): number {
  const portArgIndex = process.argv.indexOf('--port');
  if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
    const p = parseInt(process.argv[portArgIndex + 1], 10);
    if (!isNaN(p)) return p;
  }
  if (process.env.PORT) {
    const p = parseInt(process.env.PORT, 10);
    if (!isNaN(p) && p !== 8080) return p;
  }
  return 3000;
}

const PRIMARY_PORT = getPort();
const USER_PORT = 3241;

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

  // 1. Listen on Primary Port (Port 3000 for AI Studio environment)
  httpServer.listen(PRIMARY_PORT, '0.0.0.0', () => {
    console.log(`Council System server running on http://0.0.0.0:${PRIMARY_PORT}`);
  });

  // 2. Also listen on port 3241 (user requested port) if different
  if (PRIMARY_PORT !== USER_PORT) {
    const userPortServer = http.createServer(app);
    userPortServer.listen(USER_PORT, '0.0.0.0', () => {
      console.log(`User requested port listener active on http://0.0.0.0:${USER_PORT}`);
    }).on('error', (err: any) => {
      if (err.code !== 'EADDRINUSE') {
        console.warn(`Port ${USER_PORT} warning:`, err.message);
      }
    });
  }
}

startServer();
