# Remote System Documentation

This directory contains copies of files deployed to the remote Claude instance.

## Files

### CLAUDE.md
**Remote Path:** `/home/ubuntu/awsc-new/awesome/seo-processor-worker/CLAUDE.md`

Instructions for remote Claude Code CLI session. Documents:
- Automated queue processing system
- Message source distinction (super-agent vs Slack)
- webhook-notifier.js triggering logic
- Response routing based on message source
- Permission mode requirements
- System architecture

**Last Updated:** 2025-12-29

### queue-helper.js
**Remote Path:** `/home/ubuntu/awsc-new/awesome/slack-app/queue-helper.js`

Helper script for remote Claude to process messages. Commands:
- `list` - Show pending messages with source indicators
- `respond <id> "<response>"` - Send response to Slack (for Slack messages)
- `respond-superagent <id> "<response>"` - Respond to super-agent (moves to processed, webhook sent)

**Last Updated:** 2025-12-29

## Deployment

These files are uploaded to the remote server via SSH:

```bash
# CLAUDE.md
cat docs/remote/CLAUDE.md | ~/.ssh/remote-claude-wrapper.sh "cat > /home/ubuntu/awsc-new/awesome/seo-processor-worker/CLAUDE.md"

# queue-helper.js
cat docs/remote/queue-helper.js | ~/.ssh/remote-claude-wrapper.sh "cat > /home/ubuntu/awsc-new/awesome/slack-app/queue-helper.js"
chmod +x /home/ubuntu/awsc-new/awesome/slack-app/queue-helper.js
```

## System Architecture

```
Local Super-Agent                Remote Claude (ssh.manuelporras.com)
─────────────────                ─────────────────────────────────────

┌──────────────┐                 ┌────────────────────────────┐
│ SuperAgent   │─────SSH────────>│ message-queue.json         │
│ sendMessage()│  (stdin pipe)   │ /slack-app/                │
└──────────────┘                 └────────────────────────────┘
                                            │
                                            │ fs.watch (500ms debounce)
                                            ▼
                                 ┌────────────────────────────┐
                                 │ webhook-notifier.js        │
                                 │ (tmux: webhook-notifier)   │
                                 └────────────────────────────┘
                                            │
                                            │ tmux send-keys
                                            ▼
                                 ┌────────────────────────────┐
                                 │ Claude Code CLI            │
                                 │ (tmux: seo)                │
                                 │ --permission-mode bypass   │
                                 └────────────────────────────┘
                                            │
                                            │ reads CLAUDE.md
                                            │ processes queue
                                            ▼
                          ┌─────────────────┴───────────────┐
                          │                                 │
                          ▼                                 ▼
              ┌────────────────────┐          ┌────────────────────┐
              │ Slack Message      │          │ Super-Agent Message│
              │ (user: U123...)    │          │ (user: super-agent)│
              └────────────────────┘          └────────────────────┘
                          │                                 │
                          │ queue-helper.js                 │ queue-helper.js
                          │ respond                         │ respond-superagent
                          ▼                                 ▼
              ┌────────────────────┐          ┌────────────────────┐
              │ Slack API          │          │ processed[] array  │
              │ chat.update()      │          │ + webhook-notifier │
              └────────────────────┘          └────────────────────┘
                                                          │
                                                          │ HTTP POST
                                                          ▼
┌──────────────┐                 ┌────────────────────────────┐
│ Notification │<────Webhook─────│ webhook-notifier.js        │
│ Server       │   (localhost:   │ sends completion webhook   │
│ (port 9000)  │    9000/notify) │                            │
└──────────────┘                 └────────────────────────────┘
       │
       │ resolves promise
       ▼
┌──────────────┐
│ SuperAgent   │
│ response     │
└──────────────┘
```

## Key Changes (Dec 29, 2025)

### Unified Triggering System
- **Before:** Multiple processes sending "check queue" (smart-queue-trigger.sh, super-agent, webhook-notifier)
- **After:** Single unified trigger via webhook-notifier.js for ALL messages
- **Benefit:** Eliminates duplicate commands, cleaner logs

### Message Source Routing
- **Before:** queue-helper.js respond used for all messages (wrong for super-agent)
- **After:**
  - Slack messages → queue-helper.js respond → Slack API
  - Super-agent messages → queue-helper.js respond-superagent → webhook
- **Benefit:** Proper routing prevents super-agent responses going to Slack

### Split Command Technique
- **Before:** `tmux send-keys 'check queue' Enter` (Enter intercepted by UI)
- **After:** `tmux send-keys 'check queue' && tmux send-keys C-m` (split command)
- **Benefit:** Ensures Enter key executes properly

### Documentation
- **Before:** Manual queue processing instructions only
- **After:** Complete system architecture, automation, message routing
- **Benefit:** Remote Claude understands full context and automated workflows
