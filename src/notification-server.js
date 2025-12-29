/**
 * Notification Server - Receives webhooks from remote Claude
 *
 * This server:
 * 1. Listens for HTTP POST requests from remote Slack app
 * 2. Wakes up waiting promises when responses arrive
 * 3. Provides event emitter for super-agent to subscribe to
 */

import express from 'express';
import { EventEmitter } from 'events';

class NotificationServer extends EventEmitter {
  constructor(port = 9000) {
    super();
    this.port = port;
    this.app = express();
    this.server = null;
    this.pendingMessages = new Map(); // messageId -> { resolve, reject, timestamp }

    this.setupRoutes();
  }

  setupRoutes() {
    // Parse JSON bodies
    this.app.use(express.json());

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        uptime: process.uptime(),
        pendingMessages: this.pendingMessages.size
      });
    });

    // Webhook endpoint - receives notification from remote
    this.app.post('/notify', (req, res) => {
      const { messageId, status = 'completed' } = req.body;

      console.log(`[NotificationServer] Received webhook: messageId=${messageId}, status=${status}`);

      if (!messageId) {
        return res.status(400).json({ error: 'messageId required' });
      }

      // Emit event for any listeners
      this.emit('message-ready', { messageId, status });

      // Wake up waiting promise if exists
      const waiting = this.pendingMessages.get(messageId);
      if (waiting) {
        console.log(`[NotificationServer] Waking up waiting promise for ${messageId}`);
        waiting.resolve({ messageId, status, notified: true });
        this.pendingMessages.delete(messageId);
      } else {
        console.log(`[NotificationServer] No waiting promise for ${messageId} (may have already resolved)`);
      }

      res.json({ success: true, messageId });
    });

    // Debug: List all pending messages
    this.app.get('/pending', (req, res) => {
      const pending = Array.from(this.pendingMessages.entries()).map(([id, data]) => ({
        messageId: id,
        waitingSince: new Date(data.timestamp).toISOString(),
        age: Date.now() - data.timestamp
      }));

      res.json({ count: pending.length, pending });
    });
  }

  /**
   * Start the HTTP server
   */
  async start() {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, () => {
          console.log(`[NotificationServer] Listening on port ${this.port}`);
          console.log(`[NotificationServer] Webhook URL: http://localhost:${this.port}/notify`);
          resolve(this.port);
        });

        this.server.on('error', (err) => {
          console.error('[NotificationServer] Server error:', err);
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Stop the HTTP server
   */
  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('[NotificationServer] Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Register a message as waiting for notification
   * Returns a promise that resolves when webhook arrives
   */
  waitForNotification(messageId, timeout = 180000) {
    return new Promise((resolve, reject) => {
      console.log(`[NotificationServer] Registering wait for message ${messageId}`);

      // Store the promise resolvers
      this.pendingMessages.set(messageId, {
        resolve,
        reject,
        timestamp: Date.now()
      });

      // Set timeout
      const timer = setTimeout(() => {
        if (this.pendingMessages.has(messageId)) {
          console.log(`[NotificationServer] Timeout waiting for ${messageId}`);
          this.pendingMessages.delete(messageId);
          resolve({ messageId, timeout: true });
        }
      }, timeout);

      // Clean up timer when resolved
      const originalResolve = resolve;
      resolve = (value) => {
        clearTimeout(timer);
        originalResolve(value);
      };
    });
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      running: !!this.server,
      port: this.port,
      pendingMessages: this.pendingMessages.size,
      uptime: process.uptime()
    };
  }
}

export default NotificationServer;
