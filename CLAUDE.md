# Super-Agent: Inter-Claude Communication System

## Overview

This directory contains the **super-agent** system - an inter-Claude communication framework that allows this local Claude instance (running on WSL2) to send tasks to a remote Claude instance running on `ssh.manuelporras.com`.

The remote Claude processes tasks autonomously and publishes results to **https://www.manuelporras.com/awesome/**

## Architecture

### How It Works

1. **Local Claude** (you) writes tasks to the local queue or uses helper scripts
2. **PM2 Service** watches the queue and automatically sends tasks to remote via SSH
3. **Remote Claude** receives tasks via message queue, processes them autonomously
4. **Webhook Notifier** on remote triggers processing and sends completion notifications
5. **Local service** receives results and updates status files

### Key Components

- **SuperAgent Class** (`src/super-agent.js`) - Core communication logic
- **Task Watcher Service** (`services/task-watcher.js`) - PM2 background service
- **Helper Scripts** (`scripts/*.sh`) - Simple commands for common operations
- **Task Queue** (`tasks/queue.json`) - Pending/processing/completed tasks
- **Status File** (`tasks/current-status.json`) - Current task status (easy to read)

## Delegating to Remote Claude

### When to Use Remote Claude vs Local Claude

**Use Remote Claude for:**
- ✅ Publishing reports to www.manuelporras.com (remote has Apache access)
- ✅ Long-running research tasks (frees up local session)
- ✅ SEO processing tasks (remote has WordPress/database access)
- ✅ Tasks requiring specific remote tools or access
- ✅ Background processing while you continue working locally

**Use Local Claude (yourself) for:**
- ✅ Quick questions and answers
- ✅ Code modifications in this repository
- ✅ Immediate analysis and feedback
- ✅ Managing the super-agent system itself
- ✅ Tasks requiring local file access

### Syntax Convention: How User Tells You to Use Remote

When the user wants **remote Claude** to do something, they'll use one of these patterns:

```
"Send to remote: <message>"
"Remote Claude: <message>"
"Have remote Claude <do something>"
"@remote <message>"
"Queue for remote: <message>"
```

**Examples:**
```
User: "@remote Research PLTR stock and publish report to manuelporras.com"
You: *Use ./scripts/send-message.sh or add-task.sh*

User: "Send to remote: Create SEO report for example.com"
You: *Use super-agent to send the message*

User: "Have remote Claude check the health of all services"
You: *Queue the task for remote processing*
```

When the user uses **normal conversation** (no prefix), that's for you (local Claude):
```
User: "What files are in this directory?"
You: *Use ls command yourself, don't send to remote*

User: "Explain how super-agent works"
You: *Read the code and explain, don't delegate*
```

## Quick Commands

### Send Messages to Remote

**Direct send** (immediate, waits for response):
```bash
./scripts/send-message.sh "your message here"
```

**Queue task** (background service processes it):
```bash
./scripts/add-task.sh "your task description"
```

### Check Status

```bash
./scripts/check-status.sh
```

Shows:
- Pending/processing/completed counts
- Current task being processed
- Last completed task result

### Get Results

```bash
# Get latest result
./scripts/get-result.sh

# Get specific task result
./scripts/get-result.sh 1234567890
```

### Service Management

```bash
# Start PM2 background service
./scripts/start-service.sh

# Stop service
./scripts/stop-service.sh

# View logs
pm2 logs super-agent-watcher

# View status
pm2 status
```

## Usage Patterns

### Pattern 1: Quick Direct Send (Claude orchestrates)

When you need immediate response and want to handle the result yourself:

```bash
./scripts/send-message.sh "Research PLTR stock and create HTML report"
```

This blocks until complete and returns the response directly.

### Pattern 2: Background Queue (Service orchestrates)

When you want to queue tasks and let the service handle everything:

```bash
# Add task to queue
./scripts/add-task.sh "Research PLTR stock and create HTML report"

# Check status later
./scripts/check-status.sh

# Get result when done
./scripts/get-result.sh
```

The PM2 service automatically picks up tasks, sends them, waits for responses, and updates status files.

### Pattern 3: Programmatic (From Node.js)

```javascript
import SuperAgent from './src/super-agent.js';

const agent = new SuperAgent();
await agent.initialize();

const response = await agent.sendMessage("Your task here");
console.log(response);

await agent.cleanup();
```

## Task Queue System

### Queue File Structure (`tasks/queue.json`)

```json
{
  "pending": [
    {
      "id": 1234567890,
      "task": "Research PLTR stock",
      "options": {},
      "created": "2025-12-29T09:00:00.000Z"
    }
  ],
  "processing": [
    {
      "id": 1234567891,
      "task": "Another task",
      "options": {},
      "created": "2025-12-29T09:01:00.000Z"
    }
  ],
  "completed": [
    {
      "id": 1234567889,
      "task": "Previous task",
      "result": "Task completed successfully",
      "completed": "2025-12-29T08:55:00.000Z"
    }
  ]
}
```

### Status File Structure (`tasks/current-status.json`)

```json
{
  "currentTask": {
    "id": 1234567890,
    "task": "Research PLTR stock",
    "status": "processing",
    "started": "2025-12-29T09:00:00.000Z"
  },
  "lastCompleted": {
    "id": 1234567889,
    "task": "Previous task",
    "result": "Task completed successfully",
    "completed": "2025-12-29T08:55:00.000Z"
  },
  "stats": {
    "pending": 0,
    "processing": 1,
    "completed": 15
  },
  "lastUpdate": "2025-12-29T09:00:10.000Z"
}
```

## File Structure

```
/home/mp/awesome/super-agent/
├── src/
│   ├── super-agent.js           # Main SuperAgent class
│   ├── notification-server.js   # Webhook server (optional)
│   └── cli.js                   # CLI wrapper
├── services/
│   └── task-watcher.js          # PM2 background service
├── scripts/
│   ├── send-message.sh          # Direct message sender
│   ├── add-task.sh              # Add task to queue
│   ├── check-status.sh          # Check current status
│   ├── get-result.sh            # Get task results
│   ├── start-service.sh         # Start PM2 service
│   └── stop-service.sh          # Stop PM2 service
├── tasks/
│   ├── queue.json               # Task queue
│   └── current-status.json      # Current status (easy to read)
├── ecosystem.config.cjs         # PM2 configuration
├── .env                         # Environment variables
└── CLAUDE.md                    # This file
```

## Environment Variables (`.env`)

```bash
# Remote SSH connection
REMOTE_HOST=ssh.manuelporras.com
REMOTE_PORT=2222
REMOTE_USER=ubuntu
REMOTE_QUEUE_PATH=/home/ubuntu/awsc-new/awesome/slack-app/message-queue.json

# SSH key
# Uses: ~/.ssh/id_remote_claude

# Polling settings
POLL_INTERVAL_MS=5000
MESSAGE_TIMEOUT_MS=180000

# Webhook settings (optional)
# SUPER_AGENT_WEBHOOK=http://localhost:9000/notify

# Remote tmux session
REMOTE_TMUX_SESSION=seo
```

## Notification Server Modes

SuperAgent supports two modes for receiving webhook notifications:

### Standalone Server Mode (Recommended for Multiple Messages)
Run a persistent notification server:
```bash
node src/notification-server-standalone.js &
```

Benefits:
- Single server handles all webhooks
- Always ready to receive notifications
- No startup/shutdown overhead per message

When standalone server is running:
- `send-message.sh` detects it automatically
- Falls back to polling mode (standalone server can't share state with CLI instances)
- No port conflicts (EADDRINUSE errors avoided)

### Embedded Server Mode (Automatic for Single Messages)
When no standalone server is running:
- Each `send-message.sh` creates its own notification server
- Server starts, waits for response, then stops
- Slightly slower due to startup/shutdown overhead

### Port Conflict Resolution
SuperAgent automatically detects if port 9000 is in use:
1. Checks `http://localhost:9000/health` before starting server
2. If server exists: Uses polling mode, logs detection message
3. If not: Starts embedded server for this message

**No configuration needed** - system adapts automatically.

## Remote System

### Remote Claude
- **Location**: `/home/ubuntu/awsc-new/awesome/seo-processor-worker`
- **Tmux Session**: `seo`
- **Running with**: `--dangerously-skip-permissions` (allows automated commands)
- **Instructions**: `/home/ubuntu/awsc-new/awesome/seo-processor-worker/CLAUDE.md`

### Remote Message Queue
- **Path**: `/home/ubuntu/awsc-new/awesome/slack-app/message-queue.json`
- **Format**: Same as local queue (pending/processing/completed)
- **User Filter**: Only processes messages from `user: "super-agent"`

### Remote Services
- **Webhook Notifier**: Unified queue trigger for ALL messages (super-agent + Slack)
  - Watches `/home/ubuntu/awsc-new/awesome/slack-app/message-queue.json`
  - Auto-triggers "check queue" when ANY pending message is added
  - Sends webhook notifications when super-agent messages complete
  - Replaces legacy `smart-queue-trigger.sh` (deprecated)
- **Apache Web Server**: Publishes reports to https://www.manuelporras.com/awesome/

## Unified Queue Triggering System

### How Messages Trigger Remote Processing

The system uses a **unified trigger architecture** to eliminate duplicate "check queue" commands:

#### Single Trigger Point: webhook-notifier.js
- **Location**: `/home/ubuntu/awsc-new/awesome/slack-app/webhook-notifier.js`
- **Runs on**: Remote server (PM2 service)
- **Watches**: `message-queue.json` for file changes
- **Triggers for**: ALL messages (super-agent + Slack)

#### Message Flow
```
1. super-agent queues message → SSH stdin piping → message-queue.json
2. webhook-notifier detects file change (debounced 500ms)
3. Checks for new pending messages (any user)
4. Triggers: tmux send-keys -t seo 'check queue' && tmux send-keys -t seo C-m
5. Remote Claude processes message
6. webhook-notifier sends completion webhook (super-agent messages only)
7. Local notification server receives webhook → resolves response promise
```

#### Split Command Technique
The trigger uses a **split command** to ensure Enter key executes properly:

```bash
# Split into two commands (NOT one atomic command)
tmux send-keys -t seo 'check queue' && tmux send-keys -t seo C-m
```

**Why split?** Claude Code CLI's permission UI intercepts Enter when sent atomically with text. Splitting allows proper processing.

#### No Manual Triggering
- ❌ Super-agent does NOT manually trigger after queuing
- ❌ No need for separate `smart-queue-trigger.sh` process
- ✅ webhook-notifier automatically detects and triggers
- ✅ Single unified trigger eliminates duplicates

#### Message Routing
Messages are routed based on metadata:

**Super-agent messages:**
```json
{
  "user": "super-agent",
  "channel": "super-agent"
}
```
→ Webhook sent to local notification server

**Slack messages:**
```json
{
  "user": "U12345ABC",
  "channel": "C98765XYZ"
}
```
→ Response posted to Slack API (auto-queue-responder.js)

## Best Practices

### When to Use What

**Use `send-message.sh`** when:
- You need immediate response
- You want to handle the result in your current workflow
- You're doing interactive debugging

**Use `add-task.sh` + PM2 service** when:
- You have multiple tasks to process
- You want background processing
- You don't need immediate response
- You want to leverage the queue system

**Use programmatic API** when:
- Building automation scripts
- Integrating with other Node.js tools
- Need fine-grained control

### Claude Usage Tips

1. **Don't orchestrate manually** - Use the scripts and services instead of running multi-step commands
2. **Check status files first** - Read `tasks/current-status.json` before asking questions
3. **Let PM2 handle it** - Queue tasks and let the service process them
4. **Read results simply** - Use `./scripts/get-result.sh` instead of parsing JSON manually

### Example: Research Task Workflow

```bash
# 1. Queue the research task
./scripts/add-task.sh "Research Palantir (PLTR) stock, compare with SNOW, CRWD, DDOG, AI. Create HTML report and publish to www.manuelporras.com"

# 2. Check status (poll until done)
./scripts/check-status.sh

# 3. Get result when completed
./scripts/get-result.sh

# 4. Result contains URL to published report
# Example: "Published to https://www.manuelporras.com/awesome/palantir-report.html"
```

## System Processes & Auto-Start

### Critical Processes

The super-agent system requires **two critical processes** to be running at all times:

1. **Webhook Notification Server** (`webhook-notifier.js`)
   - **Purpose**: Receives completion webhooks from remote Claude
   - **Port**: 9000 (HTTP server)
   - **Required for**: Real-time response notifications (<1s latency)
   - **Falls back to**: Polling mode if server not running

2. **Remote Health Monitor** (`monitor-remote-health.js`)
   - **Purpose**: Monitors remote Claude health and triggers auto-recovery
   - **Check interval**: Every 5 minutes
   - **Freeze detection**: >10 minutes of no activity
   - **Auto-recovery**: 3-stage progressive strategy (graceful → force → manual)

### Manual Startup

**Single "Run All" Script:**
```bash
# Start all super-agent processes
./start-super-agent.sh

# Check status only (no startup)
./start-super-agent.sh --status
```

This script:
- ✅ Checks and starts webhook server if not running
- ✅ Verifies health monitor service status
- ✅ Tests remote SSH connectivity
- ✅ Shows comprehensive status dashboard
- ✅ Validates all dependencies (Node.js, required files)

**What it shows:**
```
╔════════════════════════════════════════════════════════════╗
║           SUPER-AGENT SYSTEM STATUS                        ║
╚════════════════════════════════════════════════════════════╝

✅ Webhook Server: RUNNING (PID: 12345)
✅ Health Monitor: RUNNING (systemd)
✅ Remote Claude: HEALTHY
```

### Auto-Start on Boot (Production Setup)

**Install systemd services** to auto-start processes when WSL boots:

```bash
# Install both services (requires sudo)
sudo ./install-all-services.sh
```

This installs and enables:

#### 1. Webhook Server Service
- **Service**: `webhook-server.service`
- **Status**: `sudo systemctl status webhook-server`
- **Logs**: `tail -f /tmp/webhook-server.log`
- **Auto-restarts**: On crash (RestartSec=10s)
- **Resource limits**: 256MB memory, 4096 file descriptors

#### 2. Health Monitor Service
- **Service**: `remote-claude-monitor.service`
- **Status**: `sudo systemctl status remote-claude-monitor`
- **Logs**: `sudo journalctl -u remote-claude-monitor -f`
- **Auto-restarts**: On crash (RestartSec=30s)
- **Features**: Auto-recovery, freeze detection, progressive restart strategies

### Service Management Commands

```bash
# Start all services
sudo systemctl start webhook-server remote-claude-monitor

# Stop all services
sudo systemctl stop webhook-server remote-claude-monitor

# Restart all services
sudo systemctl restart webhook-server remote-claude-monitor

# Enable auto-start on boot
sudo systemctl enable webhook-server remote-claude-monitor

# Disable auto-start
sudo systemctl disable webhook-server remote-claude-monitor

# View service status
./start-super-agent.sh --status

# View real-time logs
sudo journalctl -u webhook-server -u remote-claude-monitor -f
```

### Installation Steps (One-Time Setup)

**After first git clone or system reinstall:**

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Install systemd services:**
   ```bash
   sudo ./install-all-services.sh
   ```

3. **Verify installation:**
   ```bash
   ./start-super-agent.sh --status
   ```

Expected output:
- ✅ Webhook Server: RUNNING
- ✅ Health Monitor: RUNNING
- ✅ Remote Claude: HEALTHY

### Log Files

| Process | Log Location | Purpose |
|---------|--------------|---------|
| Webhook Server | `/tmp/webhook-server.log` | Normal output |
| Webhook Server | `/tmp/webhook-server-error.log` | Error output |
| Health Monitor | `/var/log/remote-claude-monitor.log` | Normal output |
| Health Monitor | `/var/log/remote-claude-monitor-error.log` | Error output |
| Health Checks | `/tmp/remote-health.log` | Health check history |
| Recovery | `/tmp/recovery.log` | Auto-recovery attempts |
| Status | `/tmp/remote-status.json` | Current health status (real-time) |

### Health Monitoring Details

**How freeze detection works:**
```
Time 0:00  - Remote Claude working normally
Time 0:10  - Remote stops responding (frozen)
Time 0:15  - Health monitor detects freeze (>10 min no activity)
Time 0:15  - Auto-recovery triggered: Strategy 1 (graceful restart)
Time 0:16  - Remote restarted successfully
Time 0:17  - Monitoring resumes normally
```

**Recovery strategies** (progressive escalation):

1. **Strategy 1: Graceful Restart** (Attempt 1)
   - Send Ctrl+C to current Claude session
   - Kill Claude process with SIGTERM
   - Kill tmux session cleanly
   - Start new tmux session with Claude

2. **Strategy 2: Force Restart** (Attempt 2)
   - Kill all Claude processes with SIGKILL (-9)
   - Force kill tmux session
   - Start new tmux session with Claude

3. **Strategy 3: Manual Intervention** (Attempt 3+)
   - Log failure and stop auto-recovery
   - Require manual diagnosis and restart
   - Prevents infinite restart loops

**Recovery attempt tracking:**
- Max attempts: 3 per freeze incident
- Reset after: 1 hour of successful operation
- Status file: `/tmp/recovery-attempts.txt`

### Process Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ WSL2 Machine (Local)                                        │
│                                                             │
│  ┌──────────────────────┐      ┌─────────────────────────┐│
│  │ Webhook Server       │      │ Health Monitor          ││
│  │ (Port 9000)          │◄─────┤ (5-min checks)          ││
│  │                      │      │                         ││
│  │ - Receives webhooks  │      │ - Monitors remote       ││
│  │ - Notifies clients   │      │ - Auto-recovery         ││
│  │ - Auto-starts (boot) │      │ - Auto-starts (boot)    ││
│  └──────────────────────┘      └─────────────────────────┘│
│            ▲                              │                │
│            │                              │                │
│            │ webhook                      │ SSH check      │
└────────────┼──────────────────────────────┼────────────────┘
             │                              │
             │                              ▼
┌────────────┼──────────────────────────────┼────────────────┐
│ Remote Server (ssh.manuelporras.com:2222)  │               │
│            │                              │                │
│  ┌─────────┴────────────┐      ┌─────────┴──────────────┐ │
│  │ Webhook Notifier     │      │ Claude in tmux "seo"   │ │
│  │ (Queue watcher)      │──────┤ (Task processor)       │ │
│  │                      │      │                        │ │
│  │ - Watches queue      │      │ - Processes messages   │ │
│  │ - Triggers "check"   │      │ - Sends webhooks       │ │
│  │ - Sends webhooks     │      │ - Updates queue        │ │
│  └──────────────────────┘      └────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### When Services Are Not Installed

If systemd services are **not installed** (fresh machine, services disabled):

**Webhook server**: Automatically starts per-message
- Each `send-message.sh` call creates temporary server
- Server shuts down after response received
- Slightly slower due to startup/shutdown overhead

**Health monitor**: Not running
- No automatic freeze detection
- No auto-recovery
- Manual intervention required if remote freezes

**To enable production features**: Run `sudo ./install-all-services.sh`

### Documentation

- **Quick Start Guide**: `/home/mp/awesome/super-agent/docs/QUICK-START.md`
- **Full Monitoring System**: `/home/mp/awesome/super-agent/docs/remote-monitoring-system.md`
- **Phase 4 Enhancements**: Future improvements (multi-agent redundancy, predictive failure detection)

## Troubleshooting

### Service not processing tasks
```bash
# Check if service is running
pm2 status

# View logs
pm2 logs super-agent-watcher

# Restart service
pm2 restart super-agent-watcher
```

### Task stuck in processing
```bash
# Check remote Claude is running
~/.ssh/remote-claude-wrapper.sh "tmux list-sessions"

# Check remote queue
~/.ssh/remote-claude-wrapper.sh "cat /home/ubuntu/awsc-new/awesome/slack-app/message-queue.json" | jq .

# Check webhook-notifier is running
~/.ssh/remote-claude-wrapper.sh "tmux list-sessions | grep webhook"
```

### Messages not triggering remote processing
```bash
# Check webhook-notifier logs on remote
~/.ssh/remote-claude-wrapper.sh "tmux capture-pane -t webhook-notifier -p -S -50"

# Verify webhook-notifier is watching the queue
~/.ssh/remote-claude-wrapper.sh "ps aux | grep webhook-notifier"

# Check for duplicate trigger processes (should be NONE)
~/.ssh/remote-claude-wrapper.sh "ps aux | grep smart-queue-trigger"
```

### Duplicate "check queue" commands
This should NOT happen anymore with the unified trigger system. If you see duplicates:
```bash
# Verify only webhook-notifier is triggering
~/.ssh/remote-claude-wrapper.sh "ps aux | grep -E '(webhook-notifier|smart-queue)'"

# Check for multiple file watchers
~/.ssh/remote-claude-wrapper.sh "lsof /home/ubuntu/awsc-new/awesome/slack-app/message-queue.json"
```

### SSH connection issues
```bash
# Test SSH connection
~/.ssh/remote-claude-wrapper.sh "echo 'Connection OK'"

# Check SSH key
ls -la ~/.ssh/id_remote_claude
```

## Design Philosophy

This system follows the principle: **Code orchestrates, Claude thinks**.

- ✅ Claude writes tasks to files
- ✅ Claude reads status files
- ✅ Claude summarizes results
- ✅ Scripts and services handle orchestration
- ❌ Claude doesn't manually run multi-step commands
- ❌ Claude doesn't hold system state in memory
- ❌ Claude doesn't orchestrate background processes

All logic lives in code (`*.js`, `*.sh`), not in Claude's memory. This makes the system:
- **Persistent** across Claude restarts
- **Consistent** regardless of context
- **Simple** to use and understand
- **Reliable** through automation

## Version Info

- **Created**: 2025-12-29
- **Last Updated**: 2025-12-30 (Production monitoring & auto-start system)
- **Node Version**: 20.x+
- **PM2 Version**: 5.x+

## Recent Changes

### 2025-12-30: Production Monitoring & Auto-Start System

**Phase 3 Production Monitoring:**
- ✅ Implemented health monitoring system (`monitor-remote-health.js`)
- ✅ Created auto-recovery script with 3-stage progressive strategy (`recover-remote.sh`)
- ✅ Freeze detection: >10 minutes of inactivity triggers auto-recovery
- ✅ Recovery strategies: Graceful restart → Force kill → Manual intervention
- ✅ Systemd service integration (`remote-claude-monitor.service`)
- ✅ Comprehensive documentation (Quick Start + Full System docs)

**Auto-Start on Boot:**
- ✅ Created unified startup script (`start-super-agent.sh`)
- ✅ Implemented systemd services for both webhook server and health monitor
- ✅ Installation script for one-command setup (`install-all-services.sh`)
- ✅ Auto-restart on crash with configurable intervals
- ✅ Resource limits and security hardening (NoNewPrivileges, PrivateTmp)
- ✅ Comprehensive logging to `/var/log/` and `/tmp/`

**Documentation:**
- ✅ Added "System Processes & Auto-Start" section to CLAUDE.md
- ✅ Process architecture diagram
- ✅ Service management commands
- ✅ Installation steps for new machines
- ✅ Log file locations and purposes
- ✅ Health monitoring workflow and recovery strategies

**Remote Claude Recovery:**
- ✅ Successfully recovered remote Claude from 11-hour freeze
- ✅ Used Windows SSH proxy for WSL → remote connectivity
- ✅ Verified tmux session restart and Claude process initialization

### 2025-12-29: System Improvements

**Unified Trigger System:**
- ✅ Updated webhook-notifier.js to trigger for ALL messages (super-agent + Slack)
- ✅ Implemented split command fix for tmux send-keys (Enter key execution)
- ✅ Removed manual triggering from super-agent.js (eliminated duplicates)
- ✅ Deprecated smart-queue-trigger.sh (killed on remote)
- ✅ Single unified trigger point eliminates duplicate "check queue" commands

**Race Condition Fix:**
- ✅ Added recentCompletions cache (60s TTL) to notification-server.js
- ✅ Fixed webhook initialization bug (config.useWebhooks → this.config.useWebhooks)
- ✅ Webhooks arriving before waitForNotification() now cached and retrieved

**Port Conflict Resolution:**
- ✅ Added automatic port detection (isNotificationServerRunning)
- ✅ Eliminated EADDRINUSE errors when standalone server running
- ✅ Graceful fallback to polling mode when port in use

**Remote System Documentation:**
- ✅ Updated remote CLAUDE.md with automated system architecture
- ✅ Added queue-helper.js respond-superagent command for super-agent messages
- ✅ Documented message source routing (super-agent vs Slack)
