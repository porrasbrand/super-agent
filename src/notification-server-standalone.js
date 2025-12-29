/**
 * Standalone Notification Server
 * Run this to start the webhook receiver
 *
 * Usage: node src/notification-server-standalone.js
 */

import NotificationServer from './notification-server.js';

const PORT = process.env.NOTIFICATION_PORT || 9000;

const server = new NotificationServer(PORT);

// Start server
await server.start();

console.log('');
console.log('='.repeat(60));
console.log('Notification Server Running');
console.log('='.repeat(60));
console.log(`Port: ${PORT}`);
console.log(`Health Check: http://localhost:${PORT}/health`);
console.log(`Webhook URL: http://localhost:${PORT}/notify`);
console.log(`Pending Messages: http://localhost:${PORT}/pending`);
console.log('='.repeat(60));
console.log('');
console.log('Waiting for webhooks from remote Claude...');
console.log('Press Ctrl+C to stop');
console.log('');

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  console.log('\n\nShutting down...');
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.stop();
  process.exit(0);
});

// Log when messages arrive
server.on('message-ready', ({ messageId, status }) => {
  console.log(`✅ Message ready: ${messageId} (status: ${status})`);
});
