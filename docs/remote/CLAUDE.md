# Claude Code Instructions - SEO Processor Worker

## System Architecture Overview

You are running in an **automated queue processing system** with the following components:

### Running Services
- **Session**: tmux session `seo` in `/home/ubuntu/awsc-new/awesome/seo-processor-worker`
- **Permission Mode**: `--permission-mode bypassPermissions` (NEVER cycle away from this!)
- **webhook-notifier.js**: Watches queue file, auto-triggers "check queue", sends webhooks
- **Message Queue**: `/home/ubuntu/awsc-new/awesome/slack-app/message-queue.json`

### Message Sources

The queue receives messages from TWO different sources:

| Source | user field | channel field | Response Method |
|--------|-----------|---------------|-----------------|
| **Super-agent** | `"super-agent"` | `"super-agent"` | Webhook (automatic) |
| **Slack** | `"U12345ABC"` | `"C98765XYZ"` | queue-helper.js respond |

**CRITICAL**: Do NOT use queue-helper.js for super-agent messages! They use webhooks.

---

## IMPERATIVE: Queue Processing Handler

When you receive **"check queue"** (automatically sent by webhook-notifier):

### Step 1: Read the Queue
Read: `/home/ubuntu/awsc-new/awesome/slack-app/message-queue.json`

Structure:
```json
{
  "pending": [
    {
      "id": 123456,
      "query": "user's question",
      "channel": "super-agent" | "C98765XYZ",
      "user": "super-agent" | "U12345ABC",
      "messageTs": "...",
      "timestamp": "..."
    }
  ],
  "processed": [...]
}
```

### Step 2: Process Each Pending Message
For EACH message in `pending`:
1. Read the `query` field - this is what the user asked
2. Process/answer the query (run commands, answer questions, etc.)
3. Formulate a COMPLETE response (concise summary, not raw terminal output)

### Step 3: Route Response Based on Source

#### For Slack Messages (user !== "super-agent"):
```bash
cd /home/ubuntu/awsc-new/awesome/slack-app && node queue-helper.js respond <MESSAGE_ID> "<YOUR_RESPONSE>"
```

#### For Super-Agent Messages (user === "super-agent"):
**DO NOT use queue-helper.js!** Instead:
1. Move message from `pending` to `processed` in queue file
2. Add your response to the `response` field
3. Add `respondedAt` timestamp
4. Save the queue file
5. webhook-notifier.js will automatically send webhook to local super-agent

**Use this helper script for super-agent responses:**
```bash
cd /home/ubuntu/awsc-new/awesome/slack-app && node queue-helper.js respond-superagent <MESSAGE_ID> "<YOUR_RESPONSE>"
```

### Step 4: Confirm Completion
After processing all messages, summarize:
- How many Slack messages processed
- How many super-agent messages processed
- Queue status (pending count)

---

## Automated Triggering System

### How "check queue" Gets Triggered

**webhook-notifier.js** (running in tmux session `webhook-notifier`):
- Watches `message-queue.json` using fs.watch()
- Detects file changes (debounced 500ms)
- When NEW pending messages arrive (from ANY source):
  - Sends: `tmux send-keys -t seo 'check queue'`
  - Then: `tmux send-keys -t seo C-m` (Enter)
- Split command ensures Enter executes properly

### Why Split Command?
Claude Code CLI's permission UI intercepts Enter when sent atomically with text. Splitting the command into two tmux send-keys ensures proper execution.

### Deprecated Systems
- ❌ `smart-queue-trigger.sh` - Killed on Dec 29, 2025 (replaced by webhook-notifier)
- ❌ Manual triggering from super-agent - Removed to eliminate duplicates

---

## CRITICAL: Permission Mode Warning

**Session runs in bypass permissions mode. NEVER cycle away from this!**

### DO NOT Use:
- ❌ `BTab` (Shift+Tab) - This cycles permission modes AWAY from bypass
- ❌ Any commands that change permission mode
- ❌ Restart session without `--permission-mode bypassPermissions`

### Why Bypass Mode?
Allows webhook-notifier to automatically send "check queue" without requiring manual approval. Essential for autonomous operation.

---

## Response Guidelines

### Character Limits
- **Slack**: Max ~2000 characters per response (Slack API limit)
- **Super-agent**: Max ~4000 characters (more flexible)

### Formatting
- **Use markdown**: Both support basic markdown
- **Be concise**: Summarize results, don't dump raw output
- **Include outcomes**: If you ran a task, include the result/summary
- **Handle errors**: Explain what went wrong if something failed

### Super-Agent Response Format
Prefer structured, informative responses:
```
Task: [brief description]
Result: [outcome]
Details: [key information]
Files: [URLs if published to www.manuelporras.com]
```

---

## Example Flows

### Example 1: Slack Message
```
1. Receive "check queue" (from webhook-notifier)
2. Read queue: { id: 123, user: "U98765XYZ", query: "What time is it?" }
3. Process: Get current time
4. Run: cd /home/ubuntu/awsc-new/awesome/slack-app && node queue-helper.js respond 123 "Current time: 12:34 UTC (Dec 29, 2025)"
5. Confirm: "Processed 1 Slack message, 0 pending"
```

### Example 2: Super-Agent Message
```
1. Receive "check queue" (from webhook-notifier)
2. Read queue: { id: 456, user: "super-agent", query: "Research PLTR stock" }
3. Process: Research Palantir, create HTML report
4. Run: cd /home/ubuntu/awsc-new/awesome/slack-app && node queue-helper.js respond-superagent 456 "PLTR research complete. Report: https://www.manuelporras.com/awesome/reports/pltr-analysis.html"
5. Confirm: "Processed 1 super-agent message, 0 pending"
6. webhook-notifier automatically sends webhook to local
```

### Example 3: Mixed Messages
```
1. Receive "check queue"
2. Read queue: 2 pending (1 Slack, 1 super-agent)
3. Process Slack message with queue-helper.js respond
4. Process super-agent message with queue-helper.js respond-superagent
5. Confirm: "Processed 2 messages (1 Slack, 1 super-agent), 0 pending"
```

---

## IMPERATIVE: AI Consult Handler

When you receive messages starting with **"consult-gemini"** or **"consult-openai"**, you MUST follow these steps:

### Trigger Patterns

| Pattern | Action |
|---------|--------|
| `consult-gemini on <file>` | Get Gemini 3 Pro review |
| `consult-openai on <file>` | Get GPT-5.2 review |
| `... and put the results under <dir>` | Save output to directory |
| `... and revise/analyze/give your opinion` | Claude reads and evaluates the external review |

### Step 1: Run the Consult Script

```bash
cd /home/ubuntu/awsc-new/awesome/ai-consult && node consult.js <provider> <file> [--output <dir>]
```

**Examples:**
```bash
# Gemini review, output to console
cd /home/ubuntu/awsc-new/awesome/ai-consult && node consult.js gemini /path/to/doc.md

# OpenAI review, save to docs/
cd /home/ubuntu/awsc-new/awesome/ai-consult && node consult.js openai /path/to/doc.md --output /path/to/docs/

# Code review type
cd /home/ubuntu/awsc-new/awesome/ai-consult && node consult.js gemini /path/to/code.ts --type codeReview
```

### Step 2: Handle the Results

**If user says "put results under <dir>":**
- Use `--output <dir>` flag to save the review
- Confirm the output file path

**If user says "revise" / "analyze" / "give your opinion":**
1. Run the consult command (without --output)
2. Read the external AI's feedback from the output
3. Provide Claude's own analysis of the external review:
   - Do you agree with the assessment?
   - What did they miss?
   - What would you add or change?
   - Your overall opinion

### Available Providers

| Provider | Model | Best For |
|----------|-------|----------|
| `gemini` | Gemini 3 Pro Preview | Fast, comprehensive reviews |
| `openai` | GPT-5.2 | Deep technical analysis |

### Review Types

| Type | Use When |
|------|----------|
| `handoff` (default) | Technical documentation, handoff docs |
| `codeReview` | Source code files |
| `general` | Any other content |

---

## Project Directories

- **SEO Processor**: `/home/ubuntu/awsc-new/awesome/seo-processor-worker` (current)
- **A-Crawler**: `/home/ubuntu/awsc-new/awesome/a-crawler`
- **Slack App**: `/home/ubuntu/awsc-new/awesome/slack-app`
- **AI Consult**: `/home/ubuntu/awsc-new/awesome/ai-consult`

## Key Commands

- `npm run pipeline -- --sitemap <url>` - Full SEO pipeline
- `npm run analyze -- <crawl_id> --phase6` - Run Phase 6 analysis
- `npm run api` - Start dashboard API on port 3001

---

## Troubleshooting

### Queue Not Processing
```bash
# Check webhook-notifier is running
tmux list-sessions | grep webhook

# View webhook-notifier logs
tmux capture-pane -t webhook-notifier -p -S -50

# Restart webhook-notifier if needed
tmux kill-session -t webhook-notifier
cd /home/ubuntu/awsc-new/awesome/slack-app && tmux new-session -d -s webhook-notifier 'node webhook-notifier.js'
```

### Permission Mode Issues
```bash
# Check current mode (should show "bypass permissions on")
# Look at bottom-right of screen

# If wrong mode, DO NOT use BTab
# Ask user to restart session with correct flag
```

---

## Version History

- **Dec 29, 2025**: Added automated triggering system, message source routing, webhook-notifier docs
- **Dec 26, 2025**: Added AI consult handler
- **Dec 25, 2025**: Initial queue processing handler
