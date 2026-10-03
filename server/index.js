import { createApp } from './app.js';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be a valid port number.');
const { app, close } = createApp({
  ...(process.env.DB_PATH ? { databasePath: process.env.DB_PATH } : {}),
  demoMode: process.env.DEMO_MODE === 'true',
});
const server = app.listen(port, host, () => {
  console.log(`Gather is ready at http://${host}:${server.address().port}`);
});
server.on('error', (error) => {
  console.error(`Could not start the server: ${error.message}`);
  close();
  process.exitCode = 1;
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close(() => { close(); process.exitCode = 0; });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
