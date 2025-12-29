#!/usr/bin/env node

/**
 * Queue Helper - Proper interface for Claude to process Slack queue
 *
 * Commands:
 *   node queue-helper.js list          - Show pending messages
 *   node queue-helper.js respond <id> <response> - Send response to Slack
 *   node queue-helper.js respond-superagent <id> <response> - Respond to super-agent message
 */

import "dotenv/config";
import { WebClient } from "@slack/web-api";
import fs from "node:fs";

const client = new WebClient(process.env.SLACK_BOT_TOKEN);
const QUEUE_FILE = "./message-queue.json";

function loadQueue() {
  try {
    return JSON.parse(fs.readFileSync(QUEUE_FILE, "utf8"));
  } catch {
    return { pending: [], processed: [] };
  }
}

function saveQueue(queue) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

async function listPending() {
  const queue = loadQueue();

  console.log('\n' + '='.repeat(80));
  console.log('📬 PENDING MESSAGES');
  console.log('='.repeat(80));

  if (queue.pending.length === 0) {
    console.log('\n  ✅ Queue is empty - no pending messages\n');
    console.log('='.repeat(80) + '\n');
    return;
  }

  queue.pending.forEach((msg, idx) => {
    const source = msg.user === 'super-agent' ? '🤖 Super-Agent' : '💬 Slack';
    console.log(`\n[${idx}] ${source} | ID: ${msg.id}`);
    console.log(`    Channel: ${msg.channel}`);
    console.log(`    Time: ${msg.timestamp}`);
    console.log(`    User: ${msg.user}`);

    if (msg.imageCount > 0) {
      console.log(`    Images: ${msg.imageCount}`);
      msg.images.forEach((img, i) => {
        console.log(`      ${i + 1}. ${img}`);
      });
    }

    console.log(`\n    Query:`);
    console.log(`    ${'-'.repeat(76)}`);
    const queryLines = msg.query.split('\n');
    queryLines.forEach(line => {
      console.log(`    ${line}`);
    });
    console.log(`    ${'-'.repeat(76)}`);
  });

  console.log('\n' + '='.repeat(80));
  console.log(`📊 Total: ${queue.pending.length} pending message(s)`);
  console.log('='.repeat(80) + '\n');

  console.log('To respond:');
  console.log('  Slack:        node queue-helper.js respond <id> "<response>"');
  console.log('  Super-Agent:  node queue-helper.js respond-superagent <id> "<response>"\n');
}

async function respondToMessage(messageId, responseText) {
  const queue = loadQueue();

  // Find message by ID
  const msgIndex = queue.pending.findIndex(m => m.id === parseInt(messageId));

  if (msgIndex === -1) {
    console.error(`❌ Message ID ${messageId} not found in pending queue`);
    process.exit(1);
  }

  const msg = queue.pending[msgIndex];

  // Safety check: ensure this is a Slack message
  if (msg.user === 'super-agent') {
    console.error(`❌ Message ${messageId} is from super-agent. Use 'respond-superagent' instead.`);
    console.error('   Super-agent messages use webhooks, not Slack API.');
    process.exit(1);
  }

  console.log('\n' + '📤'.repeat(40));
  console.log('SENDING RESPONSE TO SLACK');
  console.log('📤'.repeat(40));
  console.log(`Message ID: ${msg.id}`);
  console.log(`Channel: ${msg.channel}`);
  console.log(`Response length: ${responseText.length} chars`);
  console.log('📤'.repeat(40) + '\n');

  try {
    // Split into chunks if needed (Slack has 4000 char limit)
    const chunks = responseText.match(/[\s\S]{1,3500}/g) || [responseText];

    // Update the placeholder message
    await client.chat.update({
      channel: msg.channel,
      ts: msg.messageTs,
      text: chunks[0] + '\n\n_✨ Answered by Claude Code (Pro Max)_',
    });

    console.log('✅ Updated placeholder message');

    // Post additional chunks if needed
    for (let i = 1; i < chunks.length; i++) {
      await client.chat.postMessage({
        channel: msg.channel,
        thread_ts: msg.threadTs || msg.messageTs,
        text: chunks[i],
      });
      console.log(`✅ Posted chunk ${i + 1}/${chunks.length}`);
    }

    console.log('\n✅ Response sent successfully!');

    // Move to processed
    queue.processed.push({
      ...msg,
      response: responseText,
      respondedAt: new Date().toISOString(),
    });
    queue.pending.splice(msgIndex, 1);
    saveQueue(queue);

    console.log(`\n📊 Updated queue: ${queue.pending.length} pending, ${queue.processed.length} processed`);
    console.log('📤'.repeat(40) + '\n');

  } catch (error) {
    console.error('\n❌ Error sending response:', error.message);
    console.error(error);
    process.exit(1);
  }
}

async function respondToSuperAgent(messageId, responseText) {
  const queue = loadQueue();

  // Find message by ID
  const msgIndex = queue.pending.findIndex(m => m.id === parseInt(messageId));

  if (msgIndex === -1) {
    console.error(`❌ Message ID ${messageId} not found in pending queue`);
    process.exit(1);
  }

  const msg = queue.pending[msgIndex];

  // Safety check: ensure this is a super-agent message
  if (msg.user !== 'super-agent') {
    console.error(`❌ Message ${messageId} is from Slack user ${msg.user}. Use 'respond' instead.`);
    console.error('   Slack messages should use queue-helper.js respond.');
    process.exit(1);
  }

  console.log('\n' + '🤖'.repeat(40));
  console.log('RESPONDING TO SUPER-AGENT MESSAGE');
  console.log('🤖'.repeat(40));
  console.log(`Message ID: ${msg.id}`);
  console.log(`Response length: ${responseText.length} chars`);
  console.log('🤖'.repeat(40) + '\n');

  try {
    // Move to processed with response
    queue.processed.push({
      ...msg,
      response: responseText,
      respondedAt: new Date().toISOString(),
    });
    queue.pending.splice(msgIndex, 1);
    saveQueue(queue);

    console.log('✅ Response added to queue');
    console.log('✅ webhook-notifier will send webhook to local super-agent');

    console.log(`\n📊 Updated queue: ${queue.pending.length} pending, ${queue.processed.length} processed`);
    console.log('🤖'.repeat(40) + '\n');

  } catch (error) {
    console.error('\n❌ Error processing super-agent response:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Main CLI
const command = process.argv[2];

if (command === 'list') {
  await listPending();

} else if (command === 'respond') {
  const messageId = process.argv[3];
  const response = process.argv[4];

  if (!messageId || !response) {
    console.error('❌ Usage: node queue-helper.js respond <message-id> "<response>"');
    console.error('\nExample:');
    console.error('  node queue-helper.js respond 1766732919029 "Here is my response..."');
    process.exit(1);
  }

  await respondToMessage(messageId, response);

} else if (command === 'respond-superagent') {
  const messageId = process.argv[3];
  const response = process.argv[4];

  if (!messageId || !response) {
    console.error('❌ Usage: node queue-helper.js respond-superagent <message-id> "<response>"');
    console.error('\nExample:');
    console.error('  node queue-helper.js respond-superagent 1767007964179 "Task completed..."');
    process.exit(1);
  }

  await respondToSuperAgent(messageId, response);

} else {
  console.log('Queue Helper - Queue Interface for Claude\n');
  console.log('Commands:');
  console.log('  node queue-helper.js list                             - Show pending messages');
  console.log('  node queue-helper.js respond <id> "<response>"        - Send response to Slack');
  console.log('  node queue-helper.js respond-superagent <id> "<resp>" - Respond to super-agent\n');
  console.log('Examples:');
  console.log('  node queue-helper.js list');
  console.log('  node queue-helper.js respond 1766732919029 "Your Slack answer..."');
  console.log('  node queue-helper.js respond-superagent 1767007964179 "Task completed..."\n');
}
