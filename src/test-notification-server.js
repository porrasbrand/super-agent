/**
 * Test the Notification Server
 *
 * This script:
 * 1. Starts the notification server
 * 2. Simulates sending a webhook
 * 3. Tests that waiting promises are resolved
 */

import NotificationServer from './notification-server.js';

async function testNotificationServer() {
  console.log('🧪 Testing Notification Server...\n');

  const server = new NotificationServer(9001);

  try {
    // Test 1: Start server
    console.log('Test 1: Starting server...');
    await server.start();
    console.log('✅ Server started on port 9001\n');

    // Test 2: Register a waiting message
    console.log('Test 2: Registering wait for message 12345...');
    const waitPromise = server.waitForNotification(12345, 10000);
    console.log('✅ Wait registered\n');

    // Test 3: Simulate webhook (after 2 seconds)
    console.log('Test 3: Simulating webhook in 2 seconds...');
    setTimeout(async () => {
      console.log('📨 Sending webhook...');

      // Simulate HTTP POST to /notify
      const response = await fetch('http://localhost:9001/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: 12345, status: 'completed' })
      });

      const result = await response.json();
      console.log('✅ Webhook received:', result);
    }, 2000);

    // Wait for notification
    console.log('⏳ Waiting for notification...\n');
    const notification = await waitPromise;
    console.log('✅ Notification received:', notification);
    console.log('');

    // Test 4: Check status
    console.log('Test 4: Checking server status...');
    const status = server.getStatus();
    console.log('✅ Status:', status);
    console.log('');

    // Test 5: Test timeout
    console.log('Test 5: Testing timeout (5 second wait)...');
    const timeoutPromise = server.waitForNotification(99999, 5000);
    const timeoutResult = await timeoutPromise;
    console.log('✅ Timeout result:', timeoutResult);
    console.log('');

    // Cleanup
    console.log('🧹 Cleaning up...');
    await server.stop();
    console.log('✅ Server stopped\n');

    console.log('🎉 All tests passed!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed:', error);
    await server.stop();
    process.exit(1);
  }
}

testNotificationServer();
