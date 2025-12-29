/**
 * Task Watcher Service - PM2 Background Service
 *
 * Watches tasks/queue.json for new pending tasks and processes them automatically.
 *
 * Features:
 * - Polls queue file every 2 seconds
 * - Picks up pending tasks and sends to remote Claude
 * - Updates current-status.json in real-time
 * - Moves completed tasks from pending -> processing -> completed
 * - Handles errors and retries
 *
 * Run with: pm2 start services/task-watcher.js --name super-agent-watcher
 */

import SuperAgent from '../src/super-agent.js';
import { readFileSync, writeFileSync, watch } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_DIR = path.resolve(__dirname, '..');

const QUEUE_FILE = path.join(PROJECT_DIR, 'tasks/queue.json');
const STATUS_FILE = path.join(PROJECT_DIR, 'tasks/current-status.json');
const POLL_INTERVAL = 2000; // Check every 2 seconds

let superAgent = null;
let currentlyProcessing = null;

/**
 * Initialize SuperAgent
 */
async function initialize() {
  console.log('[TaskWatcher] Initializing...');
  superAgent = new SuperAgent({ useWebhooks: false }); // Use polling mode for simplicity
  await superAgent.initialize();
  console.log('[TaskWatcher] Ready');
}

/**
 * Read queue file
 */
function readQueue() {
  try {
    const content = readFileSync(QUEUE_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error('[TaskWatcher] Error reading queue:', error.message);
    return { pending: [], processing: [], completed: [] };
  }
}

/**
 * Write queue file
 */
function writeQueue(queue) {
  try {
    writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
  } catch (error) {
    console.error('[TaskWatcher] Error writing queue:', error.message);
  }
}

/**
 * Update status file
 */
function updateStatus(currentTask = null, lastCompleted = null) {
  try {
    const queue = readQueue();
    const status = {
      currentTask,
      lastCompleted,
      stats: {
        pending: queue.pending.length,
        processing: queue.processing.length,
        completed: queue.completed.length
      },
      lastUpdate: new Date().toISOString()
    };

    writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
  } catch (error) {
    console.error('[TaskWatcher] Error updating status:', error.message);
  }
}

/**
 * Process a single task
 */
async function processTask(task) {
  currentlyProcessing = task;

  console.log(`[TaskWatcher] Processing task ${task.id}: "${task.task.substring(0, 60)}..."`);

  // Update status - task is now processing
  updateStatus({
    id: task.id,
    task: task.task,
    status: 'processing',
    started: new Date().toISOString()
  });

  try {
    // Send message to remote Claude
    const response = await superAgent.sendMessage(task.task, task.options || {});

    console.log(`[TaskWatcher] Task ${task.id} completed`);
    console.log(`[TaskWatcher] Response: ${response.substring(0, 100)}...`);

    // Move task to completed
    const queue = readQueue();
    queue.processing = queue.processing.filter(t => t.id !== task.id);
    queue.completed.push({
      ...task,
      result: response,
      completed: new Date().toISOString()
    });
    writeQueue(queue);

    // Update status - task completed
    updateStatus(null, {
      id: task.id,
      task: task.task,
      result: response,
      completed: new Date().toISOString()
    });

    currentlyProcessing = null;
    return true;

  } catch (error) {
    console.error(`[TaskWatcher] Error processing task ${task.id}:`, error.message);

    // Move task back to pending for retry (or to failed queue)
    const queue = readQueue();
    queue.processing = queue.processing.filter(t => t.id !== task.id);

    // Add retry count
    task.retries = (task.retries || 0) + 1;

    if (task.retries < 3) {
      console.log(`[TaskWatcher] Retry ${task.retries}/3 for task ${task.id}`);
      queue.pending.push(task);
    } else {
      console.error(`[TaskWatcher] Task ${task.id} failed after 3 retries`);
      queue.completed.push({
        ...task,
        result: `ERROR: ${error.message}`,
        failed: true,
        completed: new Date().toISOString()
      });
    }

    writeQueue(queue);
    updateStatus(null);
    currentlyProcessing = null;
    return false;
  }
}

/**
 * Check queue and process pending tasks
 */
async function checkQueue() {
  // Don't process if already working on something
  if (currentlyProcessing) {
    return;
  }

  const queue = readQueue();

  // Move first pending task to processing
  if (queue.pending.length > 0) {
    const task = queue.pending.shift();
    queue.processing.push(task);
    writeQueue(queue);

    // Process the task
    await processTask(task);
  }
}

/**
 * Main loop
 */
async function main() {
  await initialize();

  console.log('[TaskWatcher] Starting task watcher...');
  console.log(`[TaskWatcher] Queue file: ${QUEUE_FILE}`);
  console.log(`[TaskWatcher] Status file: ${STATUS_FILE}`);
  console.log('[TaskWatcher] Polling every 2 seconds for new tasks');
  console.log('');

  // Initial status update
  updateStatus();

  // Poll queue every 2 seconds
  setInterval(async () => {
    await checkQueue();
  }, POLL_INTERVAL);
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[TaskWatcher] Shutting down...');
  if (superAgent) {
    await superAgent.cleanup();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (superAgent) {
    await superAgent.cleanup();
  }
  process.exit(0);
});

// Start the service
main().catch(error => {
  console.error('[TaskWatcher] Fatal error:', error);
  process.exit(1);
});
