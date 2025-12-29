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

## Quick Commands

### Send Messages

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
- **Webhook Notifier**: Watches remote queue, auto-triggers processing
- **Apache Web Server**: Publishes reports to https://www.manuelporras.com/awesome/

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
- **Last Updated**: 2025-12-29
- **Node Version**: 20.x+
- **PM2 Version**: 5.x+
