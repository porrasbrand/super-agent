#!/usr/bin/env node

/**
 * Simple message sender for super-agent
 * Usage: node send-message.js "Your message here"
 */

import SuperAgent from './src/super-agent.js';

const query = process.argv[2];

if (!query) {
  console.error('Usage: node send-message.js "Your message here"');
  process.exit(1);
}

const agent = new SuperAgent();

try {
  console.log(`[Local] Sending message to remote Claude...`);
  const response = await agent.sendMessage(query);

  console.log('\n' + '='.repeat(80));
  console.log('RESPONSE FROM REMOTE CLAUDE');
  console.log('='.repeat(80));
  console.log(response);
  console.log('='.repeat(80) + '\n');

  await agent.cleanup();
  process.exit(0);
} catch (error) {
  console.error('\n❌ Error:', error.message);
  await agent.cleanup();
  process.exit(1);
}
