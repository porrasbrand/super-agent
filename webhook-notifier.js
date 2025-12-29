/**
 * Webhook Notifier for Remote Slack App
 *
 * This script watches the message-queue.json file and:
 * 1. Automatically triggers "check queue" when super-agent messages are added
 * 2. Sends webhooks to super-agent when messages are processed
 *
 * Deploy this to: /home/ubuntu/awsc-new/awesome/slack-app/
 * Run with: node webhook-notifier.js
 *
 * Requirements:
 * - SUPER_AGENT_WEBHOOK environment variable must be set in .env
 */

import dotenv from 'dotenv';
import fs from 'fs';
import { watch } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const QUEUE_FILE = path.join(__dirname, 'message-queue.json');
const WEBHOOK_URL = process.env.SUPER_AGENT_WEBHOOK;

if (!WEBHOOK_URL) {
  console.error('❌ SUPER_AGENT_WEBHOOK not configured in .env');
  console.error('Add this line to .env:');
  console.error('SUPER_AGENT_WEBHOOK=https://your-tunnel-url.trycloudflare.com/notify');
  process.exit(1);
}

console.log('');
console.log('='.repeat(60));
console.log('Webhook Notifier for Super-Agent (AUTONOMOUS MODE)');
console.log('='.repeat(60));
console.log(`Queue File: ${QUEUE_FILE}`);
console.log(`Webhook URL: ${WEBHOOK_URL}`);
console.log('='.repeat(60));
console.log('');

// Track which messages we've already notified about
const notifiedMessages = new Set();

// Track which pending messages we've triggered for
const triggeredPendingMessages = new Set();

// Initialize with current processed IDs
try {
  const queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
  queue.processed.forEach(m => notifiedMessages.add(m.id));
  console.log(`📋 Loaded ${notifiedMessages.size} already-processed messages`);
} catch (error) {
  console.error('❌ Error reading queue file:', error.message);
  process.exit(1);
}

/**
 * Trigger remote Claude to check queue via tmux
 * Split into two commands to ensure Enter is processed correctly
 */
async function triggerQueueCheck() {
  try {
    const tmuxSession = 'seo';
    // Send simple "check queue" - CLAUDE.md has instructions for what this means
    // Session is in bypass permissions mode - do NOT use BTab (it cycles modes away from bypass)
    // Split into two tmux commands: first types text, then sends C-m (Enter)
    // This ensures Claude Code CLI processes the Enter key correctly
    const command = `tmux send-keys -t ${tmuxSession} 'check queue' && tmux send-keys -t ${tmuxSession} C-m`;

    await execAsync(command);
    console.log('✅ Triggered queue check via tmux');
    return true;
  } catch (error) {
    console.error('❌ Failed to trigger queue check:', error.message);
    return false;
  }
}

/**
 * Send webhook notification to super-agent
 */
async function notifyWebhook(messageId) {
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId: messageId,
        status: 'completed',
        timestamp: new Date().toISOString()
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`✅ Webhook sent for message ${messageId}:`, result);
      return true;
    } else {
      console.error(`❌ Webhook failed (${response.status}):`, await response.text());
      return false;
    }
  } catch (error) {
    console.error(`❌ Webhook error for ${messageId}:`, error.message);
    return false;
  }
}

/**
 * Check for new pending messages from super-agent and trigger processing
 */
async function checkPendingQueue() {
  try {
    const queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));

    // Find new pending messages from super-agent
    for (const message of queue.pending) {
      if (triggeredPendingMessages.has(message.id)) {
        continue; // Already triggered
      }

      // Only trigger for messages from super-agent user
      if (message.user === 'super-agent') {
        console.log(`🚀 New super-agent message detected: ${message.id}`);
        console.log(`   Query: ${message.query.substring(0, 60)}...`);

        const success = await triggerQueueCheck();

        if (success) {
          triggeredPendingMessages.add(message.id);
          console.log(`✅ Triggered processing for message ${message.id}`);
        }

        // Only trigger once per file change (batch processing)
        break;
      } else {
        // Mark as seen but don't trigger (not from super-agent)
        triggeredPendingMessages.add(message.id);
      }
    }

    // Cleanup: Remove IDs that are no longer pending
    const pendingIds = new Set(queue.pending.map(m => m.id));
    for (const id of triggeredPendingMessages) {
      if (!pendingIds.has(id)) {
        triggeredPendingMessages.delete(id);
      }
    }

    // Debug stats
    console.log(`📊 Stats: Pending=${queue.pending.length}, Triggered=${triggeredPendingMessages.size}`);
  } catch (error) {
    console.error('❌ Error checking pending queue:', error.message);
  }
}

/**
 * Check queue for new processed messages
 */
async function checkQueue() {
  try {
    const queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));

    // Find newly processed messages from super-agent
    for (const message of queue.processed) {
      if (notifiedMessages.has(message.id)) {
        continue; // Already notified
      }

      // Only notify for messages from super-agent user
      if (message.user === 'super-agent') {
        console.log(`📨 New processed message from super-agent: ${message.id}`);
        const success = await notifyWebhook(message.id);

        if (success) {
          notifiedMessages.add(message.id);
        }
      } else {
        // Mark as seen but don't notify (not from super-agent)
        notifiedMessages.add(message.id);
      }
    }
  } catch (error) {
    console.error('❌ Error checking queue:', error.message);
  }
}

// Watch the queue file for changes
let debounceTimer = null;

watch(QUEUE_FILE, (eventType) => {
  if (eventType !== 'change') return;

  // Debounce rapid file changes
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    // Check for new pending messages (triggers queue check)
    checkPendingQueue();

    // Check for processed messages (sends webhooks)
    checkQueue();
  }, 500);
});

console.log('👀 Watching for new messages (AUTONOMOUS MODE)...');
console.log('   - Auto-triggers "check queue" when super-agent messages arrive');
console.log('   - Sends webhooks when messages are processed');
console.log('Press Ctrl+C to stop');
console.log('');

// Also check periodically (every 10 seconds) in case file watcher misses something
setInterval(() => {
  checkPendingQueue();
  checkQueue();
}, 10000);

// Keep process alive
process.on('SIGINT', () => {
  console.log('\n\n🛑 Stopping webhook notifier...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.exit(0);
});
