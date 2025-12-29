# Remote Slack App Modification Guide

## Changes Needed

We need to modify `/home/ubuntu/awsc-new/awesome/slack-app/index.js` to send webhooks when messages from `super-agent` are processed.

---

## Step 1: Add Webhook URL to Remote .env

SSH into the remote and add this line to the Slack app's `.env` file:

```bash
ssh remote-claude
cd /home/ubuntu/awsc-new/awesome/slack-app
echo "SUPER_AGENT_WEBHOOK=https://wool-boxes-modeling-honest.trycloudflare.com/notify" >> .env
```

---

## Step 2: Modify index.js

Find the section in `index.js` where messages are processed. We need to add a webhook notification after writing to the `processed` array.

### Location 1: After PTY Process Exit

Find this section (around line 150-200):

```javascript
ptyProcess.onExit(({ exitCode, signal }) => {
  clearTimeout(timeout);

  // ... existing code that extracts response ...

  resolve(finalResponse);
});
```

### Add This Function at the Top (after imports):

```javascript
/**
 * Notify super-agent when a message is processed
 */
async function notifySuperAgent(messageId) {
  const webhookUrl = process.env.SUPER_AGENT_WEBHOOK;

  if (!webhookUrl) {
    return; // No webhook configured, skip
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId: messageId,
        status: 'completed',
        timestamp: new Date().toISOString()
      })
    });

    if (response.ok) {
      console.log(`[Webhook] Notified super-agent: ${messageId}`);
    } else {
      console.error(`[Webhook] Failed to notify: ${response.status}`);
    }
  } catch (error) {
    // Fail silently - super-agent will fall back to polling
    console.error('[Webhook] Error:', error.message);
  }
}
```

### Location 2: After Processing /claude Command

Find the `/claude` command handler (around line 250-350):

```javascript
app.command("/claude", async ({ command, ack, client, respond }) => {
  // ... existing code ...

  try {
    const replyText = await runClaudeInPty({ /* ... */ });

    // ... code that posts reply to Slack ...

    // NEW: Notify super-agent if message came from it
    if (sessionName === 'super-agent' || query.includes('[super-agent]')) {
      await notifySuperAgent(/* messageId */);
    }

  } catch (e) {
    // ... error handling ...
  }
});
```

**Problem:** The current flow doesn't track messageId through the PTY process.

### Better Approach: Modify Queue-Based Processing

Instead, let's hook into the queue-based processing since that's what super-agent will use.

Find where the queue is written (likely in a queue helper or in the message event handler).

---

## Step 3: Simpler Approach - Add Webhook to Queue Helper

If there's a `queue-helper.js` file, modify the `respond` function:

```javascript
// In queue-helper.js

async function respond(messageId, response) {
  const queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));

  // Find and move message from pending to processed
  const messageIndex = queue.pending.findIndex(m => m.id == messageId);

  if (messageIndex === -1) {
    console.error(`Message ${messageId} not found in pending queue`);
    return;
  }

  const message = queue.pending.splice(messageIndex, 1)[0];
  message.response = response;
  message.respondedAt = new Date().toISOString();

  queue.processed.push(message);
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));

  console.log(`✅ Response added for message ${messageId}`);

  // NEW: Notify super-agent via webhook
  if (message.user === 'super-agent') {
    await notifySuperAgent(messageId);
  }
}
```

**Add the `notifySuperAgent` function to queue-helper.js too**

---

## Alternative: Watch-Based Approach

If modifying the code is too complex, we can add a file watcher that detects changes to `message-queue.json` and sends webhooks:

```javascript
// webhook-notifier.js - New file to run alongside Slack app

import fs from 'fs';
import { watch } from 'fs';

const QUEUE_FILE = './message-queue.json';
const WEBHOOK_URL = process.env.SUPER_AGENT_WEBHOOK;

let lastProcessedIds = new Set();

// Initialize with current processed IDs
const queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
queue.processed.forEach(m => lastProcessedIds.add(m.id));

// Watch for file changes
watch(QUEUE_FILE, async (eventType) => {
  if (eventType !== 'change') return;

  const queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));

  // Find newly processed messages
  for (const message of queue.processed) {
    if (!lastProcessedIds.has(message.id) && message.user === 'super-agent') {
      console.log(`[Webhook] New processed message: ${message.id}`);

      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: message.id,
          status: 'completed'
        })
      }).catch(err => console.error('[Webhook] Error:', err));

      lastProcessedIds.add(message.id);
    }
  }
});

console.log('[Webhook Notifier] Watching', QUEUE_FILE);
```

Run this in the background:
```bash
node webhook-notifier.js &
```

---

## Recommendation

**Use the watcher approach** - it requires ZERO changes to existing Slack app code, just run a separate process.

This is cleaner and safer!
