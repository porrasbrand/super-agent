/**
 * Super-Agent - Inter-Claude Communication
 *
 * Sends messages to remote Claude Code CLI via Slack message queue
 * Receives instant notifications via webhooks (with polling fallback)
 */

import { Client } from 'ssh2';
import NotificationServer from './notification-server.js';
import dotenv from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SuperAgent {
  constructor(config = {}) {
    this.config = {
      remoteHost: config.remoteHost || process.env.REMOTE_HOST || 'ssh.manuelporras.com',
      remotePort: config.remotePort || parseInt(process.env.REMOTE_PORT) || 2222,
      remoteUser: config.remoteUser || process.env.REMOTE_USER || 'ubuntu',
      queuePath: config.queuePath || process.env.REMOTE_QUEUE_PATH ||
        '/home/ubuntu/awsc-new/awesome/slack-app/message-queue.json',
      sshKeyPath: config.sshKeyPath || path.join(process.env.HOME, '.ssh/id_remote_claude'),
      pollInterval: config.pollInterval || parseInt(process.env.POLL_INTERVAL_MS) || 5000,
      messageTimeout: config.messageTimeout || parseInt(process.env.MESSAGE_TIMEOUT_MS) || 180000,
      useWebhooks: config.useWebhooks !== undefined ? config.useWebhooks : true,
      notificationPort: config.notificationPort || 9000,
      ...config
    };

    this.sshClient = null;
    this.notificationServer = config.useWebhooks ? new NotificationServer(this.config.notificationPort) : null;
    this.isInitialized = false;
  }

  /**
   * Initialize super-agent (connect SSH, start notification server)
   */
  async initialize() {
    if (this.isInitialized) return;

    console.log('[SuperAgent] Initializing...');

    // Start notification server if using webhooks
    if (this.notificationServer) {
      try {
        await this.notificationServer.start();
        console.log(`[SuperAgent] Notification server started on port ${this.config.notificationPort}`);
      } catch (error) {
        console.warn('[SuperAgent] Failed to start notification server:', error.message);
        console.warn('[SuperAgent] Falling back to polling only');
        this.notificationServer = null;
      }
    }

    this.isInitialized = true;
    console.log('[SuperAgent] Initialized');
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.sshClient) {
      this.sshClient.end();
      this.sshClient = null;
    }

    if (this.notificationServer) {
      await this.notificationServer.stop();
    }

    this.isInitialized = false;
  }

  /**
   * Create SSH connection
   */
  async createSSHConnection() {
    return new Promise((resolve, reject) => {
      const client = new Client();

      client.on('ready', () => {
        resolve(client);
      });

      client.on('error', (err) => {
        reject(err);
      });

      client.connect({
        host: this.config.remoteHost,
        port: this.config.remotePort,
        username: this.config.remoteUser,
        privateKey: readFileSync(this.config.sshKeyPath)
      });
    });
  }

  /**
   * Execute command on remote via SSH wrapper script
   */
  async executeRemoteCommand(command) {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Use the SSH wrapper script that works through Windows
    const wrapperScript = path.join(process.env.HOME, '.ssh/remote-claude-wrapper.sh');
    const fullCommand = `${wrapperScript} "${command.replace(/"/g, '\\"')}"`;

    try {
      const { stdout, stderr } = await execAsync(fullCommand);

      if (stderr && !stderr.includes('dotenv')) {
        console.warn('[SuperAgent] SSH stderr:', stderr);
      }

      return stdout;
    } catch (error) {
      throw new Error(`Remote command failed: ${error.message}`);
    }
  }

  /**
   * Read remote message queue
   */
  async readRemoteQueue() {
    const output = await this.executeRemoteCommand(`cat ${this.config.queuePath}`);
    return JSON.parse(output);
  }

  /**
   * Write remote message queue
   */
  async writeRemoteQueue(queue) {
    // Convert queue to JSON
    const queueJSON = JSON.stringify(queue, null, 2);

    // Use stdin piping to avoid command-line length limits
    // This pipes the JSON content directly to the remote file
    const { spawn } = await import('child_process').then(m => m.default || m);

    return new Promise((resolve, reject) => {
      const wrapperScript = path.join(process.env.HOME, '.ssh/remote-claude-wrapper.sh');

      // SSH command that reads from stdin and writes to file
      const remoteCommand = `cat > ${this.config.queuePath}`;

      // Spawn SSH process
      const ssh = spawn(wrapperScript, [remoteCommand]);

      let stderr = '';

      ssh.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ssh.on('close', (code) => {
        if (code === 0) {
          console.log('[SuperAgent] Queue written to remote via stdin');
          resolve();
        } else {
          reject(new Error(`SSH write failed with code ${code}: ${stderr}`));
        }
      });

      ssh.on('error', (err) => {
        reject(new Error(`SSH spawn error: ${err.message}`));
      });

      // Pipe the JSON content to SSH stdin
      ssh.stdin.write(queueJSON);
      ssh.stdin.end();
    });
  }

  /**
   * Trigger remote Claude to check queue
   * Uses tmux to send "check queue" command with proper Enter key
   * Split into two commands to ensure Enter is processed correctly
   */
  async triggerRemoteQueueCheck() {
    try {
      const tmuxSession = this.config.remoteTmuxSession || process.env.REMOTE_TMUX_SESSION || 'seo';

      // Send simple "check queue" command - CLAUDE.md has instructions for what this means
      // Session is in bypass permissions mode - do NOT use BTab (it cycles modes)
      // Split into two tmux commands: first types text, then sends C-m (Enter)
      // This ensures Claude Code CLI processes the Enter key correctly
      const command = `tmux send-keys -t ${tmuxSession} 'check queue' && tmux send-keys -t ${tmuxSession} C-m`;

      await this.executeRemoteCommand(command);
      console.log('[SuperAgent] ✅ Triggered remote queue check via tmux');
      return true;
    } catch (error) {
      console.warn('[SuperAgent] ⚠️  Failed to trigger queue check:', error.message);
      console.warn('[SuperAgent] Relying on webhook-notifier auto-trigger...');
      return false;
    }
  }

  /**
   * Send message to remote Claude
   */
  async sendMessage(query, options = {}) {
    await this.initialize();

    // Generate unique message ID
    const messageId = Date.now();

    console.log(`[SuperAgent] Sending message ${messageId}: "${query.substring(0, 50)}..."`);

    // Create message object
    const message = {
      id: messageId,
      sessionName: options.session || null,
      query: query,
      channel: options.channel || 'super-agent',
      messageTs: Date.now().toString(),
      timestamp: new Date().toISOString(),
      user: 'super-agent',
      images: options.images || [],
      imageCount: options.images?.length || 0
    };

    // Add to remote pending queue
    const queue = await this.readRemoteQueue();
    queue.pending.push(message);
    await this.writeRemoteQueue(queue);

    console.log(`[SuperAgent] Message queued on remote`);

    // Note: webhook-notifier automatically detects new pending messages and triggers queue check
    // No manual trigger needed - reduces duplicate "check queue" commands

    // Wait for response using webhooks + polling fallback
    const response = await this.waitForResponse(messageId, options.timeout || this.config.messageTimeout);

    return response;
  }

  /**
   * Wait for response (webhook + polling fallback)
   */
  async waitForResponse(messageId, timeout) {
    const startTime = Date.now();

    // Strategy: Use webhook if available, but also poll as backup
    if (this.notificationServer) {
      console.log(`[SuperAgent] Waiting for webhook notification (timeout: ${timeout}ms)...`);

      // Register for webhook notification
      const webhookPromise = this.notificationServer.waitForNotification(messageId, timeout);

      // Also start polling in background as fallback
      const pollingPromise = this.pollForResponse(messageId, timeout);

      // Race: whoever resolves first wins
      const result = await Promise.race([webhookPromise, pollingPromise]);

      if (result.notified) {
        console.log(`[SuperAgent] Response received via webhook in ${Date.now() - startTime}ms`);
      } else if (result.polled) {
        console.log(`[SuperAgent] Response received via polling in ${Date.now() - startTime}ms`);
      } else if (result.timeout) {
        console.log(`[SuperAgent] Timeout after ${Date.now() - startTime}ms`);
      }

      // Get actual response content
      if (!result.timeout) {
        const queue = await this.readRemoteQueue();
        const processed = queue.processed.find(m => m.id === messageId);
        return processed?.response || '(No response content)';
      } else {
        throw new Error(`Timeout waiting for response to message ${messageId} after ${timeout}ms`);
      }

    } else {
      // No webhook server, use polling only
      console.log(`[SuperAgent] Using polling mode (interval: ${this.config.pollInterval}ms)...`);
      const result = await this.pollForResponse(messageId, timeout);

      if (result.polled) {
        console.log(`[SuperAgent] Response received via polling in ${Date.now() - startTime}ms`);
        return result.response;
      } else if (result.timeout) {
        throw new Error(`Timeout waiting for response to message ${messageId} after ${timeout}ms`);
      }
    }
  }

  /**
   * Poll remote queue for response
   */
  async pollForResponse(messageId, timeout) {
    const startTime = Date.now();
    let pollCount = 0;

    while (Date.now() - startTime < timeout) {
      pollCount++;

      try {
        const queue = await this.readRemoteQueue();
        const processed = queue.processed.find(m => m.id === messageId);

        if (processed) {
          console.log(`[SuperAgent] Response found via polling (poll #${pollCount})`);
          return { messageId, polled: true, response: processed.response };
        }
      } catch (error) {
        console.error(`[SuperAgent] Polling error:`, error.message);
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, this.config.pollInterval));
    }

    return { messageId, timeout: true };
  }

  /**
   * Get message history from remote queue
   */
  async getHistory(limit = 10) {
    const queue = await this.readRemoteQueue();
    return queue.processed.slice(-limit).reverse();
  }

  /**
   * Get current queue status
   */
  async getStatus() {
    const queue = await this.readRemoteQueue();
    return {
      pending: queue.pending.length,
      processed: queue.processed.length,
      queuePath: this.config.queuePath,
      webhooksEnabled: !!this.notificationServer,
      notificationServerStatus: this.notificationServer?.getStatus() || null
    };
  }
}

export default SuperAgent;
