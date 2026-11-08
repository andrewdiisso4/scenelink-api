'use strict';

// Temporary cutover responder. Do not import the application or connect to data.
const http = require('node:http');
const port = Number(process.env.PORT || 10000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Maintenance responder could not start.');
  process.exitCode = 1;
} else {
  const server = http.createServer((req, res) => {
    const healthy = (req.method === 'GET' || req.method === 'HEAD') &&
      req.url === '/api/health';
    res.writeHead(healthy ? 200 : 503, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Connection': 'close',
      ...(healthy ? {} : { 'Retry-After': '60' }),
    });
    res.end(JSON.stringify(healthy
      ? { status: 'maintenance', mode: 'database-free' }
      : { error: 'Service temporarily unavailable' }));
  });

  server.once('error', () => {
    console.error('Maintenance responder could not start.');
    process.exitCode = 1;
  });
  server.listen(port, '0.0.0.0');

  let stopping = false;
  process.on('SIGTERM', () => {
    if (stopping) return;
    stopping = true;
    // Finish responses, then exit. Bound shutdown below Render's 30-second default.
    const deadline = setTimeout(() => {
      server.closeAllConnections();
      process.exit(0);
    }, 20000);
    deadline.unref();
    server.close(() => {
      clearTimeout(deadline);
      process.exit(0);
    });
  });
}
