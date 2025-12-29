# Super-Agent: Inter-Claude Communication System

An autonomous inter-Claude communication framework that enables local Claude instances to send tasks to remote Claude instances via SSH and message queues.

## Features

- 🚀 **Autonomous Processing** - PM2 background service automatically processes queued tasks
- 🔄 **Dual-Mode Operation** - Direct send (immediate) or queue-based (background)
- 📊 **Status Tracking** - Real-time status files for easy monitoring
- 🔁 **Auto-Retry** - Failed tasks automatically retry up to 3 times
- 🛡️ **Webhook Support** - Instant notifications when tasks complete (with polling fallback)
- 📝 **Simple Scripts** - Shell scripts for all common operations

## Architecture

```
┌─────────────────┐
│  Local Claude   │
│   (WSL2/Mac)    │
└────────┬────────┘
         │ writes tasks
         ▼
┌─────────────────────────┐
│  Task Queue             │
│  tasks/queue.json       │
└────────┬────────────────┘
         │ watched by
         ▼
┌─────────────────────────┐
│  PM2 Task Watcher       │
│  services/task-watcher  │
└────────┬────────────────┘
         │ SSH + stdin pipe
         ▼
┌─────────────────────────┐
│  Remote Message Queue   │
│  (remote server)        │
└────────┬────────────────┘
         │ triggers
         ▼
┌─────────────────────────┐
│  Remote Claude          │
│  (bypass permissions)   │
└────────┬────────────────┘
         │ publishes
         ▼
┌─────────────────────────┐
│  Published Reports      │
│  www.example.com        │
└─────────────────────────┘
```

## Quick Start

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/super-agent.git
cd super-agent

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your remote server details
nano .env

# Start PM2 background service (optional)
./scripts/start-service.sh
```

### Usage

**Send message directly:**
```bash
./scripts/send-message.sh "Research PLTR stock and create HTML report"
```

**Queue task for background processing:**
```bash
./scripts/add-task.sh "Research PLTR stock and create HTML report"
./scripts/check-status.sh
./scripts/get-result.sh
```

**Programmatic usage:**
```javascript
import SuperAgent from './src/super-agent.js';

const agent = new SuperAgent();
await agent.initialize();
const response = await agent.sendMessage("Your task here");
console.log(response);
await agent.cleanup();
```

## Documentation

See [CLAUDE.md](./CLAUDE.md) for complete documentation including:
- Architecture details
- Usage patterns
- File structure
- Troubleshooting guide
- Best practices

## Requirements

- Node.js 20.x+
- PM2 5.x+ (for background service, optional)
- SSH access to remote server
- Remote Claude instance with `--dangerously-skip-permissions` flag

## Project Structure

```
super-agent/
├── src/
│   ├── super-agent.js           # Main SuperAgent class
│   ├── notification-server.js   # Webhook notification server
│   └── cli.js                   # CLI wrapper
├── services/
│   └── task-watcher.js          # PM2 background service
├── scripts/
│   ├── send-message.sh          # Direct message sender
│   ├── add-task.sh              # Add task to queue
│   ├── check-status.sh          # Check status
│   ├── get-result.sh            # Get results
│   ├── start-service.sh         # Start PM2 service
│   └── stop-service.sh          # Stop PM2 service
├── tasks/                       # Runtime data (git-ignored)
│   ├── queue.json
│   └── current-status.json
├── ecosystem.config.cjs         # PM2 configuration
├── .env.example                 # Environment template
├── CLAUDE.md                    # Full documentation
└── README.md                    # This file
```

## Configuration

Edit `.env` file with your settings:

```bash
REMOTE_HOST=ssh.example.com      # Your remote server
REMOTE_PORT=2222                  # SSH port
REMOTE_USER=ubuntu                # SSH user
REMOTE_QUEUE_PATH=/path/to/queue # Remote message queue path
REMOTE_TMUX_SESSION=seo          # Remote tmux session name
```

## Commands Reference

| Command | Description |
|---------|-------------|
| `./scripts/send-message.sh "text"` | Send message directly, wait for response |
| `./scripts/add-task.sh "text"` | Add task to queue (PM2 processes) |
| `./scripts/check-status.sh` | Check current task status |
| `./scripts/get-result.sh` | Get latest completed task result |
| `./scripts/start-service.sh` | Start PM2 background service |
| `./scripts/stop-service.sh` | Stop PM2 service |
| `pm2 logs super-agent-watcher` | View service logs |
| `pm2 status` | View service status |

## Design Philosophy

**Code orchestrates, Claude thinks.**

- Claude writes tasks to files
- Scripts and services handle orchestration
- Logic lives in code (`.js`, `.sh`), not Claude's memory
- System persists across Claude restarts

## Troubleshooting

**Service not running:**
```bash
pm2 status
pm2 restart super-agent-watcher
pm2 logs super-agent-watcher
```

**SSH connection issues:**
```bash
~/.ssh/remote-claude-wrapper.sh "echo 'Connection OK'"
```

**Task stuck:**
```bash
# Check remote queue
~/.ssh/remote-claude-wrapper.sh "cat /path/to/queue.json" | jq .
```

## License

MIT

## Contributing

Contributions welcome! Please read [CLAUDE.md](./CLAUDE.md) to understand the system architecture.

## Author

Built with Claude Code - An inter-Claude communication system.
