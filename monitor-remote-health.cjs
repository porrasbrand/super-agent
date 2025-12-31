#!/usr/bin/env node
/**
 * Remote Claude Health Monitor - Production Grade
 *
 * Monitors remote Claude CLI process health and triggers auto-recovery
 * when process becomes frozen or unresponsive.
 *
 * Author: Super-Agent System
 * Version: 1.0.0
 */

const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');

// Configuration
const CONFIG = {
  HEALTH_CHECK_INTERVAL: 5 * 60 * 1000,      // 5 minutes
  WEBHOOK_TIMEOUT: 10 * 60 * 1000,           // 10 minutes = frozen
  RECOVERY_SCRIPT: path.join(__dirname, 'recover-remote.sh'),
  WEBHOOK_LOG: '/tmp/claude/-home-mp-awesome-super-agent/tasks/be7f9b7.output',
  HEALTH_LOG: '/tmp/remote-health.log',
  STATUS_FILE: '/tmp/remote-status.json',
  ALERT_COOLDOWN: 30 * 60 * 1000,            // 30 minutes between alerts
};

let lastAlertTime = 0;

/**
 * Get timestamp of last webhook message received
 */
function getLastWebhookTime() {
  try {
    if (!fs.existsSync(CONFIG.WEBHOOK_LOG)) {
      console.warn(`Webhook log not found: ${CONFIG.WEBHOOK_LOG}`);
      return 0;
    }

    const webhookLog = fs.readFileSync(CONFIG.WEBHOOK_LOG, 'utf8');

    // Find all completed webhook messages
    const matches = webhookLog.match(/messageId=(\d+), status=completed/g);

    if (!matches || matches.length === 0) {
      return 0;
    }

    // Get the most recent message ID (which is a timestamp)
    const lastMatch = matches[matches.length - 1];
    const messageId = lastMatch.match(/messageId=(\d+)/)[1];

    return parseInt(messageId);
  } catch (error) {
    console.error('Error reading webhook log:', error.message);
    return 0;
  }
}

/**
 * Check remote Claude health status
 */
async function checkRemoteHealth() {
  const lastWebhookTime = getLastWebhookTime();
  const now = Date.now();
  const timeSinceLastWebhook = now - lastWebhookTime;
  const minutesSince = Math.floor(timeSinceLastWebhook / 60000);

  const status = {
    timestamp: new Date().toISOString(),
    lastWebhook: lastWebhookTime > 0 ? new Date(lastWebhookTime).toISOString() : 'never',
    minutesSinceLastWebhook: minutesSince,
    isFrozen: timeSinceLastWebhook > CONFIG.WEBHOOK_TIMEOUT,
    isHealthy: timeSinceLastWebhook <= CONFIG.WEBHOOK_TIMEOUT,
  };

  // Write status to file for external monitoring
  fs.writeFileSync(CONFIG.STATUS_FILE, JSON.stringify(status, null, 2));

  // Log health check
  const logEntry = `[${status.timestamp}] Last activity: ${minutesSince} min ago | Status: ${status.isFrozen ? 'FROZEN ❌' : 'HEALTHY ✅'}\n`;
  fs.appendFileSync(CONFIG.HEALTH_LOG, logEntry);

  if (status.isFrozen) {
    console.error(`❌ Remote FROZEN for ${minutesSince} minutes (last activity: ${status.lastWebhook})`);
    return 'frozen';
  }

  console.log(`✅ Remote healthy (last activity: ${minutesSince} min ago)`);
  return 'healthy';
}

/**
 * Trigger recovery process
 */
async function triggerRecovery() {
  return new Promise((resolve, reject) => {
    console.log('🔄 Triggering auto-recovery...');

    if (!fs.existsSync(CONFIG.RECOVERY_SCRIPT)) {
      const error = `Recovery script not found: ${CONFIG.RECOVERY_SCRIPT}`;
      console.error(error);
      sendAlert(error);
      reject(new Error(error));
      return;
    }

    exec(CONFIG.RECOVERY_SCRIPT, { timeout: 60000 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Recovery failed: ${error.message}`);
        console.error(stderr);
        sendAlert(`Remote recovery failed: ${error.message}\n${stderr}`);
        reject(error);
        return;
      }

      console.log('✅ Recovery process completed');
      console.log(stdout);

      // Wait 30 seconds, then verify recovery
      setTimeout(() => verifyRecovery(resolve, reject), 30000);
    });
  });
}

/**
 * Verify that recovery was successful
 */
function verifyRecovery(resolve, reject) {
  console.log('🔍 Verifying recovery...');

  // Send test message to remote
  exec('node send-message.js "Health check - reply with OK"', {
    timeout: 30000,
    cwd: __dirname
  }, (error, stdout) => {
    if (error) {
      console.error('❌ Recovery verification failed - no response from remote');
      sendAlert('Remote recovery verification failed - manual check needed');
      reject(error);
      return;
    }

    if (stdout.includes('OK') || stdout.includes('Queue Status')) {
      console.log('✅ Recovery verified - remote is responsive');
      resolve(true);
    } else {
      console.warn('⚠️  Recovery uncertain - unexpected response from remote');
      console.log(stdout);
      resolve(false);
    }
  });
}

/**
 * Send alert notification
 */
function sendAlert(message) {
  // Rate limit alerts
  const now = Date.now();
  if (now - lastAlertTime < CONFIG.ALERT_COOLDOWN) {
    console.log('⏸️  Alert suppressed (cooldown period)');
    return;
  }

  lastAlertTime = now;

  console.error(`🚨 ALERT: ${message}`);

  // Log alert to file
  const alertLog = `/tmp/remote-alerts.log`;
  const entry = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(alertLog, entry);

  // TODO: Implement additional alert mechanisms
  // - Email notification
  // - Slack webhook
  // - SMS via Twilio
  // - PagerDuty/OpsGenie
}

/**
 * Main monitoring loop
 */
async function monitorAndRecover() {
  try {
    const health = await checkRemoteHealth();

    if (health === 'frozen') {
      await triggerRecovery();
    }
  } catch (error) {
    console.error('Error in monitor loop:', error.message);
  }
}

/**
 * Graceful shutdown handler
 */
function shutdown() {
  console.log('\n🛑 Shutting down health monitor...');
  const finalStatus = {
    timestamp: new Date().toISOString(),
    status: 'monitor_stopped',
  };
  fs.writeFileSync(CONFIG.STATUS_FILE, JSON.stringify(finalStatus, null, 2));
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Initial health check
console.log('🚀 Remote Claude Health Monitor started');
console.log(`📊 Health check interval: ${CONFIG.HEALTH_CHECK_INTERVAL / 60000} minutes`);
console.log(`⏱️  Frozen threshold: ${CONFIG.WEBHOOK_TIMEOUT / 60000} minutes`);
console.log(`📝 Health log: ${CONFIG.HEALTH_LOG}`);
console.log(`📄 Status file: ${CONFIG.STATUS_FILE}`);
console.log('');

monitorAndRecover();

// Schedule periodic checks
setInterval(monitorAndRecover, CONFIG.HEALTH_CHECK_INTERVAL);
