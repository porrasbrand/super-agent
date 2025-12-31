# Remote Claude Monitoring and Auto-Recovery System

**Version:** 1.0.0
**Status:** Production
**Last Updated:** December 30, 2025

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Phase 3: Production Implementation](#phase-3-production-implementation)
- [Installation Guide](#installation-guide)
- [Configuration](#configuration)
- [Monitoring and Alerts](#monitoring-and-alerts)
- [Troubleshooting](#troubleshooting)
- [Phase 4: Future Enhancements](#phase-4-future-enhancements)

---

## Overview

### Purpose

The Remote Claude Monitoring System provides automated health monitoring and recovery for remote Claude CLI processes running on `ssh.manuelporras.com`. It detects frozen or unresponsive processes and automatically attempts recovery without manual intervention.

### Key Features

- **Continuous Health Monitoring** - Checks remote process health every 5 minutes
- **Auto-Recovery** - Automatically restarts frozen processes using progressive recovery strategies
- **Production-Grade Reliability** - Runs as systemd service with automatic restart
- **Comprehensive Logging** - Detailed logs for debugging and audit trails
- **Rate-Limited Alerts** - Prevents alert fatigue with intelligent cooldown periods

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│  LOCAL: Super-Agent (mp@localhost)                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Systemd Service: remote-claude-monitor                 │ │
│  │   ↓                                                     │ │
│  │ monitor-remote-health.js (Node.js)                     │ │
│  │   • Checks webhook activity every 5 min                │ │
│  │   • Detects frozen state (>10 min no activity)         │ │
│  │   • Triggers recovery script                           │ │
│  │   ↓                                                     │ │
│  │ recover-remote.sh (Bash)                               │ │
│  │   • Strategy 1: Graceful restart (Ctrl-C)              │ │
│  │   • Strategy 2: Force kill (pkill -9)                  │ │
│  │   • Strategy 3: Alert for manual intervention          │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                             │
                             │ SSH (port 2222)
                             ↓
┌─────────────────────────────────────────────────────────────┐
│  REMOTE: ssh.manuelporras.com (ubuntu@remote)               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ tmux session: "seo"                                    │ │
│  │   └─ claude --dangerously-skip-permissions             │ │
│  │        ↓                                                │ │
│  │     Working Directory:                                 │ │
│  │     /home/ubuntu/awsc-new/awesome/seo-processor-worker │ │
│  │        ↓                                                │ │
│  │     Webhook notifications → Local webhook server       │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Health Detection Mechanism

The system monitors webhook activity from the remote Claude process:

1. **Webhook Server** (`be7f9b7`) logs all remote activity to:
   ```
   /tmp/claude/-home-mp-awesome-super-agent/tasks/be7f9b7.output
   ```

2. **Health Monitor** parses webhook log to extract last activity timestamp:
   ```javascript
   const matches = webhookLog.match(/messageId=(\d+), status=completed/g);
   const lastMessageId = parseInt(matches[matches.length - 1]);
   ```

3. **Frozen Detection**:
   - If `(currentTime - lastWebhookTime) > 10 minutes` → **FROZEN**
   - Triggers recovery script

### Recovery Strategies

**Progressive Recovery Approach:**

```
┌──────────────────────────────────────────────────────────┐
│ Strategy 1: Graceful Restart                             │
│   • Send Ctrl-C to tmux session                          │
│   • Wait 2 seconds for clean shutdown                    │
│   • SIGTERM if still running                             │
│   • Kill tmux session                                    │
│   • Start fresh Claude process                           │
│   Timeout: 25 seconds                                    │
└──────────────────────────────────────────────────────────┘
              ↓ (if failed)
┌──────────────────────────────────────────────────────────┐
│ Strategy 2: Force Kill                                   │
│   • pkill -9 (force kill all Claude processes)           │
│   • Kill tmux session                                    │
│   • Clean up zombie processes                            │
│   • Start fresh Claude process                           │
│   Timeout: 20 seconds                                    │
└──────────────────────────────────────────────────────────┘
              ↓ (if failed)
┌──────────────────────────────────────────────────────────┐
│ Strategy 3: Alert for Manual Intervention                │
│   • Log critical error                                   │
│   • Send alert (if configured)                           │
│   • Exit with error code                                 │
│   • Requires manual server console access               │
└──────────────────────────────────────────────────────────┘
```

**Attempt Limiting:**
- Maximum 3 recovery attempts per hour
- After 3 failures → Manual intervention required
- Counter resets on successful recovery

---

## Phase 3: Production Implementation

### Prerequisites

- Node.js installed (v14+ recommended)
- SSH key authentication configured for remote access
- Systemd (Linux system with systemd init)
- sudo/root access for service installation

### Files Created

```
/home/mp/awesome/super-agent/
├── monitor-remote-health.js         # Main monitoring script (Node.js)
├── recover-remote.sh                # Recovery script (Bash)
├── remote-claude-monitor.service    # Systemd service definition
└── docs/
    └── remote-monitoring-system.md  # This documentation
```

---

## Installation Guide

### Step 1: Install Systemd Service

```bash
# Copy service file to systemd directory
sudo cp /home/mp/awesome/super-agent/remote-claude-monitor.service \
        /etc/systemd/system/

# Reload systemd to recognize new service
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable remote-claude-monitor

# Start the service
sudo systemctl start remote-claude-monitor
```

### Step 2: Verify Service Status

```bash
# Check if service is running
sudo systemctl status remote-claude-monitor

# Expected output:
# ● remote-claude-monitor.service - Remote Claude Health Monitor
#    Loaded: loaded (/etc/systemd/system/remote-claude-monitor.service; enabled)
#    Active: active (running) since...
#    Main PID: 12345 (node)
#    Tasks: 11
#    Memory: 45.2M
#    CGroup: /system.slice/remote-claude-monitor.service
#            └─12345 /usr/bin/node /home/mp/awesome/super-agent/monitor-remote-health.js
```

### Step 3: Monitor Logs

```bash
# View live logs (follow mode)
sudo journalctl -u remote-claude-monitor -f

# View last 100 lines
sudo journalctl -u remote-claude-monitor -n 100

# View logs from today
sudo journalctl -u remote-claude-monitor --since today

# View detailed health log
tail -f /tmp/remote-health.log

# View recovery log
tail -f /tmp/recovery.log
```

### Step 4: Create Log Rotation (Optional but Recommended)

```bash
# Create logrotate config
sudo tee /etc/logrotate.d/remote-claude-monitor << 'EOF'
/var/log/remote-claude-monitor.log
/var/log/remote-claude-monitor-error.log
/tmp/remote-health.log
/tmp/recovery.log
/tmp/remote-alerts.log
{
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 mp mp
}
EOF
```

---

## Configuration

### Monitoring Parameters

Edit `/home/mp/awesome/super-agent/monitor-remote-health.js`:

```javascript
const CONFIG = {
  HEALTH_CHECK_INTERVAL: 5 * 60 * 1000,      // Check every 5 minutes
  WEBHOOK_TIMEOUT: 10 * 60 * 1000,           // Frozen after 10 min inactivity
  RECOVERY_SCRIPT: './recover-remote.sh',
  WEBHOOK_LOG: '/tmp/claude/.../be7f9b7.output',
  HEALTH_LOG: '/tmp/remote-health.log',
  STATUS_FILE: '/tmp/remote-status.json',
  ALERT_COOLDOWN: 30 * 60 * 1000,            // 30 min between alerts
};
```

**Recommended Thresholds:**
- **Development:** 15 minute timeout, 10 minute checks
- **Production:** 10 minute timeout, 5 minute checks (default)
- **Aggressive:** 5 minute timeout, 2 minute checks

### SSH Configuration

Edit `/home/mp/awesome/super-agent/recover-remote.sh`:

```bash
SSH_HOST="ssh.manuelporras.com"
SSH_PORT="2222"
SSH_USER="ubuntu"
SSH_KEY="$HOME/.ssh/id_remote_claude"
REMOTE_WORKDIR="/home/ubuntu/awsc-new/awesome/seo-processor-worker"
TMUX_SESSION="seo"
```

### Recovery Attempt Limits

```bash
MAX_RECOVERY_ATTEMPTS=3   # Max attempts per hour
```

**Tuning Guidance:**
- **Aggressive:** 5 attempts (may cause thrashing)
- **Balanced:** 3 attempts (recommended)
- **Conservative:** 1 attempt (requires more manual intervention)

---

## Monitoring and Alerts

### Real-Time Status

Check current remote status:

```bash
# View status file (JSON)
cat /tmp/remote-status.json

# Example output:
{
  "timestamp": "2025-12-30T08:30:00.000Z",
  "lastWebhook": "2025-12-30T08:25:00.000Z",
  "minutesSinceLastWebhook": 5,
  "isFrozen": false,
  "isHealthy": true
}
```

### Health Check Log

```bash
tail -f /tmp/remote-health.log
```

Example output:
```
[2025-12-30T08:20:00.000Z] Last activity: 3 min ago | Status: HEALTHY ✅
[2025-12-30T08:25:00.000Z] Last activity: 8 min ago | Status: HEALTHY ✅
[2025-12-30T08:30:00.000Z] Last activity: 13 min ago | Status: FROZEN ❌
```

### Recovery Attempts Log

```bash
tail -f /tmp/recovery.log
```

Example output:
```
[2025-12-30 08:30:15] ╔════════════════════════════════════════════╗
[2025-12-30 08:30:15] ║   REMOTE CLAUDE AUTO-RECOVERY INITIATED    ║
[2025-12-30 08:30:15] ╚════════════════════════════════════════════╝
[2025-12-30 08:30:15] 📊 Current recovery attempts: 0 / 3
[2025-12-30 08:30:15] 🔄 Recovery attempt #1 of 3
[2025-12-30 08:30:16] Testing SSH connectivity...
[2025-12-30 08:30:17] ✅ SSH connection successful
[2025-12-30 08:30:17] 📍 Strategy 1: Graceful restart
[2025-12-30 08:30:42] ✅ Graceful restart succeeded
[2025-12-30 08:30:42] ✅ Recovery successful (graceful)
```

### Alert Notifications

**Current Implementation:**
- Logs to `/tmp/remote-alerts.log`
- Console error output (captured by systemd journal)

**To Enable Email Alerts:**

Edit `monitor-remote-health.js`:

```javascript
function sendAlert(message) {
  // ... existing code ...

  // Add email notification
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    auth: {
      user: 'your-email@gmail.com',
      pass: 'your-app-password'
    }
  });

  transporter.sendMail({
    from: 'super-agent@yourcompany.com',
    to: 'admin@yourcompany.com',
    subject: '🚨 Remote Claude Alert',
    text: message
  });
}
```

**To Enable Slack Alerts:**

```javascript
function sendAlert(message) {
  // ... existing code ...

  // Add Slack webhook
  const axios = require('axios');
  axios.post('https://hooks.slack.com/services/YOUR/WEBHOOK/URL', {
    text: `🚨 *Remote Claude Alert*\n\`\`\`${message}\`\`\``
  });
}
```

---

## Troubleshooting

### Service Won't Start

**Check service status:**
```bash
sudo systemctl status remote-claude-monitor
```

**Common issues:**

1. **Permission Errors**
   ```bash
   # Fix file permissions
   chmod +x /home/mp/awesome/super-agent/monitor-remote-health.js
   chmod +x /home/mp/awesome/super-agent/recover-remote.sh
   ```

2. **Node.js Not Found**
   ```bash
   # Verify Node.js path
   which node
   # Update ExecStart in service file if needed
   sudo nano /etc/systemd/system/remote-claude-monitor.service
   ```

3. **Log File Permissions**
   ```bash
   # Create log directory
   sudo touch /var/log/remote-claude-monitor.log
   sudo touch /var/log/remote-claude-monitor-error.log
   sudo chown mp:mp /var/log/remote-claude-monitor*.log
   ```

### Recovery Always Failing

**Check SSH connectivity:**
```bash
# Test manual SSH connection
ssh -i ~/.ssh/id_remote_claude -p 2222 ubuntu@ssh.manuelporras.com

# Test with timeout
timeout 10 ssh -i ~/.ssh/id_remote_claude -p 2222 ubuntu@ssh.manuelporras.com 'echo "Connection OK"'
```

**Check network:**
```bash
# Test host reachability
ping -c 3 ssh.manuelporras.com

# Test port
nc -zv ssh.manuelporras.com 2222
```

**Check recovery attempts:**
```bash
cat /tmp/recovery-attempts.txt
# If at max (3), reset manually:
echo "0" > /tmp/recovery-attempts.txt
```

### Remote Still Frozen After Recovery

**Manual verification:**
```bash
# SSH into remote
ssh -i ~/.ssh/id_remote_claude -p 2222 ubuntu@ssh.manuelporras.com

# Check tmux session exists
tmux list-sessions

# Attach to session to see what's happening
tmux attach -t seo

# Check Claude process
ps aux | grep claude

# Check for zombie processes
ps aux | grep defunct
```

**Force manual restart:**
```bash
# On remote server
pkill -9 claude
tmux kill-session -t seo
cd /home/ubuntu/awsc-new/awesome/seo-processor-worker
tmux new-session -d -s seo 'claude --dangerously-skip-permissions'
```

### False Frozen Alerts

**If system incorrectly reports frozen status:**

1. **Check webhook log exists and is updating:**
   ```bash
   ls -lh /tmp/claude/-home-mp-awesome-super-agent/tasks/be7f9b7.output
   tail -f /tmp/claude/-home-mp-awesome-super-agent/tasks/be7f9b7.output
   ```

2. **Verify webhook server is running:**
   ```bash
   ps aux | grep webhook-notifier
   # Should show Node.js process running webhook-notifier.js
   ```

3. **Increase frozen threshold** (if remote is legitimately slow):
   ```javascript
   // In monitor-remote-health.js
   WEBHOOK_TIMEOUT: 15 * 60 * 1000,  // Increase to 15 minutes
   ```

---

## Phase 4: Future Enhancements

*This section outlines advanced features planned for future implementation.*

### 4.1 Multi-Agent Redundancy

**Objective:** Eliminate single point of failure by running backup Claude instances.

**Architecture:**
```
┌─────────────────────────────────────────────┐
│  Primary Agent (tmux: seo)                  │
│  - Handles main workload                    │
│  - Active monitoring                        │
└─────────────────────────────────────────────┘
              ↓ (if frozen >5 min)
┌─────────────────────────────────────────────┐
│  Secondary Agent (tmux: seo-backup)         │
│  - Standby mode (minimal resources)         │
│  - Auto-promotes to primary on failure      │
└─────────────────────────────────────────────┘
              ↓ (if both frozen)
┌─────────────────────────────────────────────┐
│  Tertiary Agent (different server)          │
│  - Last resort failover                     │
│  - Different infrastructure                 │
└─────────────────────────────────────────────┘
```

**Implementation Steps:**

1. **Create Backup Tmux Session:**
   ```bash
   # On remote server
   tmux new-session -d -s seo-backup 'sleep infinity'
   # Backup stays idle until needed
   ```

2. **Health Monitor Detects Primary Failure:**
   ```javascript
   if (primaryFrozen && recoveryAttemptsFailed >= 2) {
     console.log('🔄 Promoting backup agent to primary');
     promoteBackupToPrimary();
   }
   ```

3. **Promotion Logic:**
   ```bash
   # Kill frozen primary
   tmux kill-session -t seo

   # Start Claude in backup session
   tmux send-keys -t seo-backup "cd $WORKDIR && claude --dangerously-skip-permissions" C-m

   # Rename backup to primary
   tmux rename-session -t seo-backup seo

   # Create new backup
   tmux new-session -d -s seo-backup 'sleep infinity'
   ```

**Benefits:**
- Near-zero downtime (failover in <30 seconds)
- No work lost if primary freezes mid-task
- Automatic fallback chain

**Complexity:** Medium
**Estimated Implementation:** 4-6 hours

---

### 4.2 Predictive Failure Detection

**Objective:** Predict Claude freezes before they happen using ML/heuristics.

**Signals to Monitor:**

1. **Response Time Degradation:**
   - Track average response time per message
   - Alert if response time >2x normal
   - Example: Normal = 30s, Alert if >60s

2. **Memory Usage:**
   ```bash
   # On remote, monitor Claude process memory
   ps aux | grep claude | awk '{print $6}'  # RSS in KB
   # Alert if >1GB (Claude may be thrashing)
   ```

3. **Message Queue Depth:**
   - Track pending messages in queue
   - Alert if queue depth >5 (Claude falling behind)

4. **Error Rate:**
   - Count tool call failures
   - Alert if error rate >10% (instability)

**Prediction Algorithm:**

```javascript
function predictFailure(metrics) {
  let riskScore = 0;

  // Slow responses
  if (metrics.avgResponseTime > metrics.normalResponseTime * 1.5) {
    riskScore += 30;
  }

  // High memory usage
  if (metrics.memoryUsageMB > 800) {
    riskScore += 25;
  }

  // Large queue
  if (metrics.queueDepth > 3) {
    riskScore += 20;
  }

  // High error rate
  if (metrics.errorRate > 0.05) {
    riskScore += 25;
  }

  if (riskScore > 50) {
    return 'high_risk';  // Preemptive restart recommended
  } else if (riskScore > 30) {
    return 'medium_risk';
  }
  return 'low_risk';
}
```

**Preemptive Actions:**
- **High Risk:** Gracefully restart before freeze occurs
- **Medium Risk:** Send warning, continue monitoring closely
- **Low Risk:** Normal operation

**Benefits:**
- Prevent freezes instead of reacting to them
- Minimize user-visible downtime
- Smoother operation

**Complexity:** High
**Estimated Implementation:** 2-3 days
**Requires:** Historical data collection (1 week baseline)

---

### 4.3 Advanced Alert Integrations

**Objective:** Comprehensive notification across multiple channels.

**Supported Channels:**

1. **Email (SMTP/SendGrid)**
   ```javascript
   // Priority: High severity only
   sendEmail({
     to: 'admin@company.com',
     subject: '🚨 Critical: Remote Claude Down',
     body: alertDetails,
     priority: 'high'
   });
   ```

2. **Slack Webhook**
   ```javascript
   // All alerts go to #alerts channel
   slack.send({
     channel: '#remote-claude-alerts',
     text: '⚠️ Health check failed',
     attachments: [{
       color: 'danger',
       fields: [...]
     }]
   });
   ```

3. **SMS (Twilio)**
   ```javascript
   // Critical only (freeze >30 min)
   twilio.messages.create({
     to: '+1234567890',
     from: '+0987654321',
     body: '🚨 Remote Claude frozen 30+ min'
   });
   ```

4. **PagerDuty/OpsGenie**
   ```javascript
   // Trigger incident for manual intervention needed
   pagerduty.createIncident({
     title: 'Remote Claude Recovery Failed',
     severity: 'critical',
     service: 'remote-claude'
   });
   ```

5. **Custom Webhooks**
   ```javascript
   // Post to internal monitoring dashboard
   axios.post('https://dashboard.company.com/api/alerts', {
     source: 'remote-claude-monitor',
     level: 'error',
     message: alertMessage
   });
   ```

**Alert Routing Logic:**

```javascript
function routeAlert(severity, message) {
  if (severity === 'critical') {
    sendEmail(message);
    sendSMS(message);
    createPagerDutyIncident(message);
  } else if (severity === 'warning') {
    sendSlack(message);
  } else {
    logOnly(message);
  }
}
```

**Complexity:** Low-Medium (per integration)
**Estimated Implementation:** 2-4 hours per channel

---

### 4.4 Auto-Scaling Based on Load

**Objective:** Dynamically scale remote agents based on workload.

**Metrics to Monitor:**
- Queue depth
- Average response time
- CPU/Memory utilization on remote

**Scaling Rules:**

```javascript
if (queueDepth > 10 && avgResponseTime > 60) {
  // Heavy load - scale UP
  spawnAdditionalAgent('seo-worker-2');
  distributeWorkload(['seo', 'seo-worker-2']);
}

if (queueDepth === 0 && agents.length > 1) {
  // Light load - scale DOWN
  gracefullyShutdownAgent('seo-worker-2');
}
```

**Benefits:**
- Handle traffic spikes automatically
- Reduce costs during idle periods
- Better resource utilization

**Complexity:** Very High
**Estimated Implementation:** 1-2 weeks
**Requires:** Load balancer, work distribution logic

---

### 4.5 Historical Metrics Dashboard

**Objective:** Web-based dashboard showing remote health over time.

**Features:**
- Real-time status indicator (green/red)
- Response time graph (last 24h)
- Uptime percentage (last 7 days)
- Recovery event timeline
- Alert history

**Tech Stack:**
- Backend: Express.js API
- Frontend: React + Chart.js
- Database: SQLite (for metrics storage)

**Example Queries:**

```sql
-- Uptime calculation
SELECT
  (COUNT(*) FILTER (WHERE status = 'healthy') * 100.0 / COUNT(*)) as uptime_pct
FROM health_checks
WHERE timestamp > datetime('now', '-7 days');

-- Average response time
SELECT
  strftime('%H:00', timestamp) as hour,
  AVG(response_time_ms) as avg_response
FROM messages
WHERE timestamp > datetime('now', '-24 hours')
GROUP BY hour;
```

**Complexity:** Medium
**Estimated Implementation:** 3-5 days

---

### 4.6 Self-Healing Infrastructure

**Objective:** Automatically fix common infrastructure issues.

**Auto-Fixable Issues:**

1. **Disk Space Full:**
   ```bash
   # Detect
   if df -h | grep '/home' | awk '{print $5}' | sed 's/%//' > 90; then
     # Fix
     find /home/ubuntu/.claude/cache -type f -atime +7 -delete
     find /tmp -type f -atime +3 -delete
   fi
   ```

2. **Memory Leak:**
   ```bash
   # Detect Claude using >2GB
   if ps aux | grep claude | awk '{sum+=$6} END {print sum/1024/1024}' > 2; then
     # Fix: Restart before system thrashes
     restart_claude_gracefully
   fi
   ```

3. **Zombie Processes:**
   ```bash
   # Detect
   if ps aux | grep defunct | grep -v grep; then
     # Fix
     kill -9 $(ps aux | grep defunct | awk '{print $2}')
   fi
   ```

4. **Stale Tmux Sessions:**
   ```bash
   # Detect tmux sessions with no attached clients for >24h
   # Fix: Kill and recreate
   ```

**Complexity:** Medium
**Estimated Implementation:** 1-2 days

---

## Summary: Monitoring System Status

### ✅ Phase 3: IMPLEMENTED (Current)

- [x] Continuous health monitoring (5 min interval)
- [x] Auto-recovery with progressive strategies
- [x] Systemd service integration
- [x] Comprehensive logging
- [x] Rate-limited alerts
- [x] Recovery attempt limiting
- [x] SSH-based remote control
- [x] Tmux session management

### 📋 Phase 4: PLANNED (Future)

- [ ] Multi-agent redundancy
- [ ] Predictive failure detection
- [ ] Advanced alert integrations (Email, Slack, SMS, PagerDuty)
- [ ] Auto-scaling based on load
- [ ] Historical metrics dashboard
- [ ] Self-healing infrastructure

---

## Support and Maintenance

### Log Locations

| Log Type | Location |
|----------|----------|
| Service logs | `/var/log/remote-claude-monitor.log` |
| Service errors | `/var/log/remote-claude-monitor-error.log` |
| Health checks | `/tmp/remote-health.log` |
| Recovery attempts | `/tmp/recovery.log` |
| Alerts | `/tmp/remote-alerts.log` |
| Systemd journal | `journalctl -u remote-claude-monitor` |

### Service Management Commands

```bash
# Start service
sudo systemctl start remote-claude-monitor

# Stop service
sudo systemctl stop remote-claude-monitor

# Restart service
sudo systemctl restart remote-claude-monitor

# Check status
sudo systemctl status remote-claude-monitor

# Enable on boot
sudo systemctl enable remote-claude-monitor

# Disable on boot
sudo systemctl disable remote-claude-monitor

# View logs
sudo journalctl -u remote-claude-monitor -f
```

### Manual Testing

```bash
# Test monitoring script manually
cd /home/mp/awesome/super-agent
node monitor-remote-health.js

# Test recovery script manually
./recover-remote.sh

# Force a recovery test (simulate freeze)
echo "9999999999999" > /tmp/claude/-home-mp-awesome-super-agent/tasks/be7f9b7.output
# Wait 10+ minutes for monitor to detect and trigger recovery
```

---

## Changelog

### Version 1.0.0 (2025-12-30)
- Initial production release
- Health monitoring system
- Auto-recovery with progressive strategies
- Systemd service integration
- Comprehensive documentation

---

## License

Internal use only - Super-Agent System
© 2025 All Rights Reserved

---

**For questions or issues, contact:** System Administrator
