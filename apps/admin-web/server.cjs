const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = 5173;

const backendTarget = 'http://localhost:3000';

// Proxy API + Socket.IO (HTTP + WebSocket)
// http-proxy-middleware v4 strips the /api prefix by default when mounted on /api.
// The backend expects /api/v1/..., so we need to PREPEND /api back.
app.use(
  '/api',
  createProxyMiddleware({
    target: backendTarget,
    changeOrigin: true,
    ws: false,
    pathRewrite: (path, req) => {
      return `/api${path}`;
    },
    on: {
      proxyReq: (proxyReq, req) => {
        console.log(`[PROXY] ${req.method} ${req.originalUrl} → ${proxyReq.path}`);
      },
      proxyRes: (proxyRes, req) => {
        console.log(`[PROXY] ← ${proxyRes.statusCode} for ${req.originalUrl}`);
      },
      error: (err, req, res) => {
        console.error('[API PROXY ERROR]', err.message);
        if (res.writeHead) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Proxy error', message: err.message }));
        }
      },
    },
  })
);

app.use(
  '/socket.io',
  createProxyMiddleware({
    target: backendTarget,
    changeOrigin: true,
    ws: true,
    pathRewrite: (path, req) => {
      return `/api${path}`;
    },
    on: {
      proxyReq: (proxyReq, req) => {
        console.log(`[PROXY WS] ${req.method} ${req.originalUrl} → ${proxyReq.path}`);
      },
      error: (err, req, res) => {
        console.error('[WS PROXY ERROR]', err.message);
      },
    },
  })
);

// Serve static files
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`Admin panel running on http://localhost:${PORT}`);
});

// Upgrade WebSocket connections for Socket.IO
server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith('/socket.io')) {
    // http-proxy-middleware handles WebSocket upgrade via its own upgrade handler
    // But we need to let the proxy handle it
  }
});
