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

const app = express();

// User requested port: 3241
const PORT: number = 3241;
const PREVIEW_PORT: number = 3000;

app.use(express.json());

// API Routes
app.use('/api', apiRouter);

async function startServer() {
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV === 'production') {
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

  // 1. Listen on requested port 3241
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Council System server running on http://0.0.0.0:${PORT} (Requested: 3241)`);
  });

  // 2. Also listen on port 3000 for AI Studio cloud preview environment
  if (PORT !== PREVIEW_PORT) {
    const previewServer = http.createServer(app);
    previewServer.listen(PREVIEW_PORT, '0.0.0.0', () => {
      console.log(`AI Studio preview listener active on http://0.0.0.0:${PREVIEW_PORT}`);
    }).on('error', (err: any) => {
      if (err.code !== 'EADDRINUSE') {
        console.warn(`Preview listener warning on port ${PREVIEW_PORT}:`, err.message);
      }
    });
  }
}

startServer();
