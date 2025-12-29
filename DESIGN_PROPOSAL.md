# Super-Agent Design Proposal
## Inter-Claude Communication via Slack Message Queue

**Date:** 2025-12-29
**Status:** Design Phase
**Purpose:** Enable this Claude Code CLI instance (local WSL2) to communicate with the remote Claude Code CLI instance via the existing Slack app infrastructure

---

## Executive Summary

We have an existing communication infrastructure where a remote Claude Code CLI instance monitors and processes messages through a Slack app's message queue system. This proposal outlines how to enable **bidirectional communication** between two Claude Code CLI instances using this proven message queue pattern.

---

## Current Architecture Analysis

### Remote Setup (ssh.manuelporras.com)

**Location:** `/home/ubuntu/awsc-new/awesome/`

**Components:**
1. **Claude Code CLI** (Remote Agent)
   - Running in tmux session "seo"
   - Working directory: `/home/ubuntu/awsc-new/awesome/seo-processor-worker`
   - Monitors Slack queue via instructions in `CLAUDE.md`

2. **Slack App** (`/home/ubuntu/awsc-new/awesome/slack-app`)
   - Node.js application using `@slack/bolt` (Socket Mode)
   - Spawns Claude CLI sessions using `node-pty`
   - Two-way bridge: Slack ↔ Claude Code CLI

3. **Message Queue** (`message-queue.json`)
   ```json
   {
     "pending": [/* messages waiting to be processed */],
     "processed": [/* completed messages with responses */]
   }
   ```

**Current Flow:**
```
User → Slack → Slack App → message-queue.json → Remote Claude → Slack App → Slack → User
```

---

## Proposed Super-Agent Architecture

### Design Pattern: Message Queue as IPC (Inter-Process Communication)

Instead of users sending messages via Slack, **this local Claude instance** will:
1. Write messages to the remote message queue
2. Poll for responses
3. Process the response locally

### Communication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Local WSL2 (This Claude Instance)                              │
│  /home/mp/awesome/super-agent                                   │
│                                                                  │
│  ┌──────────────────┐                                           │
│  │ Super Agent      │                                           │
│  │ (Node.js App)    │                                           │
│  └────────┬─────────┘                                           │
│           │                                                      │
│           ├─> 1. Write query to remote message-queue.json       │
│           ├─> 2. Poll for response in processed array           │
│           └─> 3. Return response to local Claude                │
└───────────┼──────────────────────────────────────────────────────┘
            │
            │ SSH Connection (via Windows SSH proxy)
            │ ~/.ssh/remote-claude-wrapper.sh
            │
┌───────────▼──────────────────────────────────────────────────────┐
│  Remote Server (ssh.manuelporras.com)                            │
│  /home/ubuntu/awsc-new/awesome/                                  │
│                                                                   │
│  ┌─────────────────────┐        ┌──────────────────┐            │
│  │ message-queue.json  │◄──────►│  Slack App       │            │
│  │ {                   │        │  (index.js)      │            │
│  │   pending: [...],   │        └────────┬─────────┘            │
│  │   processed: [...]  │                 │                      │
│  │ }                   │                 │ node-pty spawn       │
│  └─────────────────────┘                 │                      │
│                                           ▼                      │
│                                  ┌──────────────────┐            │
│                                  │  Remote Claude   │            │
│                                  │  Code CLI        │            │
│                                  │  (seo-processor) │            │
│                                  └──────────────────┘            │
└───────────────────────────────────────────────────────────────────┘
```

---

## Technical Design

### 1. Super-Agent Core Module

**File:** `src/super-agent.js`

**Responsibilities:**
- Send messages to remote Claude
- Poll for responses
- Handle timeouts and errors
- Maintain session tracking

**Key Functions:**

```javascript
class SuperAgent {
  constructor(config) {
    this.remoteHost = config.REMOTE_CONNECTION_STRING
    this.queuePath = config.SLACK_APP_PATH + '/message-queue.json'
    this.sshWrapper = '~/.ssh/remote-claude-wrapper.sh'
  }

  async sendMessage(query, options = {}) {
    // 1. Generate unique message ID
    const messageId = Date.now()

    // 2. Create message object
    const message = {
      id: messageId,
      query: query,
      channel: options.channel || 'super-agent',
      messageTs: Date.now().toString(),
      timestamp: new Date().toISOString(),
      user: 'super-agent',
      images: options.images || [],
      imageCount: options.images?.length || 0
    }

    // 3. Append to remote pending queue
    await this.appendToPendingQueue(message)

    // 4. Wait for response
    const response = await this.waitForResponse(messageId, options.timeout)

    return response
  }

  async appendToPendingQueue(message) {
    // Read remote queue via SSH
    const queue = await this.readRemoteQueue()

    // Add to pending
    queue.pending.push(message)

    // Write back via SSH
    await this.writeRemoteQueue(queue)
  }

  async waitForResponse(messageId, timeout = 180000) {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      const queue = await this.readRemoteQueue()

      // Check if our message was processed
      const processed = queue.processed.find(m => m.id === messageId)

      if (processed) {
        return processed.response
      }

      // Poll every 5 seconds
      await new Promise(resolve => setTimeout(resolve, 5000))
    }

    throw new Error(`Timeout waiting for response to message ${messageId}`)
  }

  async readRemoteQueue() {
    // Use SSH wrapper to read file
    const result = await execAsync(
      `${this.sshWrapper} "cat ${this.queuePath}"`
    )
    return JSON.parse(result.stdout)
  }

  async writeRemoteQueue(queue) {
    // Write to temp file, then move via SSH
    const tempFile = `/tmp/queue-${Date.now()}.json`
    await fs.writeFile(tempFile, JSON.stringify(queue, null, 2))

    await execAsync(
      `scp -F ~/.ssh/config ${tempFile} remote-claude:${this.queuePath}`
    )

    await fs.unlink(tempFile)
  }
}
```

### 2. Session Management

**File:** `src/session-manager.js`

Track conversations across multiple message exchanges:

```javascript
class SessionManager {
  constructor() {
    this.sessions = new Map()
  }

  createSession(name) {
    const session = {
      id: crypto.randomUUID(),
      name: name,
      messages: [],
      createdAt: new Date()
    }
    this.sessions.set(session.id, session)
    return session
  }

  async sendInSession(sessionId, query) {
    const session = this.sessions.get(sessionId)

    // Prefix query with session name (slack-app convention)
    const prefixedQuery = `${session.name}: ${query}`

    const response = await superAgent.sendMessage(prefixedQuery)

    session.messages.push({ query, response, timestamp: new Date() })

    return response
  }
}
```

### 3. File Transfer Support

**File:** `src/file-transfer.js`

For sending files/code to remote Claude:

```javascript
async function sendFileToRemote(localPath, remotePath) {
  // Use scp via SSH wrapper
  await execAsync(
    `scp -F ~/.ssh/config ${localPath} remote-claude:${remotePath}`
  )
}

async function getFileFromRemote(remotePath, localPath) {
  await execAsync(
    `scp -F ~/.ssh/config remote-claude:${remotePath} ${localPath}`
  )
}
```

### 4. CLI Interface

**File:** `src/cli.js`

Provide command-line interface for testing:

```bash
# Send a single message
node cli.js send "What time is it?"

# Send with session
node cli.js send --session mywork "Run the build"

# Check queue status
node cli.js status

# View recent messages
node cli.js history --limit 10
```

---

## API Design

### SuperAgent Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `sendMessage(query, options)` | Send query to remote Claude | `Promise<string>` |
| `sendCommand(command)` | Execute bash command on remote | `Promise<string>` |
| `sendFile(localPath, remotePath)` | Transfer file to remote | `Promise<void>` |
| `getFile(remotePath, localPath)` | Fetch file from remote | `Promise<void>` |
| `checkStatus()` | Check remote Claude status | `Promise<object>` |
| `getHistory(limit)` | Get recent message history | `Promise<array>` |

### Options Object

```javascript
{
  timeout: 180000,        // Response timeout (ms)
  channel: 'super-agent', // Channel identifier
  session: null,          // Session name (optional)
  images: [],             // Image paths to send
  waitForCompletion: true // Wait for full response
}
```

---

## Implementation Plan

### Phase 1: Core Infrastructure (Estimated: 2-3 hours)
- [ ] Set up project structure
- [ ] Implement SSH wrapper integration
- [ ] Create `readRemoteQueue()` and `writeRemoteQueue()`
- [ ] Test basic queue read/write

### Phase 2: Message Sending (Estimated: 2 hours)
- [ ] Implement `sendMessage()` with ID generation
- [ ] Implement `appendToPendingQueue()`
- [ ] Test message queueing

### Phase 3: Response Polling (Estimated: 2 hours)
- [ ] Implement `waitForResponse()` with timeout
- [ ] Add exponential backoff for polling
- [ ] Test end-to-end message → response flow

### Phase 4: Session Management (Estimated: 1 hour)
- [ ] Implement SessionManager
- [ ] Add session persistence
- [ ] Test multi-turn conversations

### Phase 5: CLI & Testing (Estimated: 2 hours)
- [ ] Create CLI interface
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Documentation

**Total Estimated Time:** 9-10 hours

---

## Configuration

### Environment Variables (.env)

```bash
# Existing
REMOTE_HOST=ssh.manuelporras.com
REMOTE_USER=ubuntu
REMOTE_PORT=2222
REMOTE_CONNECTION_STRING=ssh ssh.manuelporras.com -p 2222 -l ubuntu

# New
REMOTE_QUEUE_PATH=/home/ubuntu/awsc-new/awesome/slack-app/message-queue.json
REMOTE_WORKING_DIR=/home/ubuntu/awsc-new/awesome/seo-processor-worker
POLL_INTERVAL_MS=5000
MESSAGE_TIMEOUT_MS=180000
SSH_WRAPPER_PATH=/home/mp/.ssh/remote-claude-wrapper.sh
```

---

## Security Considerations

### 1. Authentication
- ✅ SSH key-based authentication already configured
- ✅ No passwords stored in code
- ✅ SSH config manages credentials

### 2. Message Queue Access
- **Risk:** Multiple writers could corrupt queue JSON
- **Mitigation:** Implement file locking or atomic writes
- **Recommendation:** Use `flock` on remote when writing:
  ```bash
  flock /tmp/queue.lock -c "cat queue.json > /tmp/backup && jq '...' > queue.json"
  ```

### 3. Message Tampering
- **Risk:** Messages could be modified by other processes
- **Mitigation:** Add message signature/hash validation
- **Optional:** Encrypt message content

---

## Error Handling

### Timeout Scenarios
```javascript
class TimeoutError extends Error {
  constructor(messageId, elapsed) {
    super(`Message ${messageId} timed out after ${elapsed}ms`)
    this.messageId = messageId
  }
}
```

### Network Failures
- Retry SSH connections with exponential backoff
- Cache last known queue state locally
- Provide fallback to direct SSH execution

### Queue Corruption
- Validate JSON before writing
- Keep backup of last valid queue state
- Auto-repair on parse errors

---

## Usage Examples

### Example 1: Simple Query
```javascript
const superAgent = new SuperAgent()

const response = await superAgent.sendMessage(
  "What is the status of crawl 1028?"
)

console.log(response)
// "Crawl 1028 (pearcehvac.com): 427 pages crawled, Phase 6 complete..."
```

### Example 2: Session-Based Work
```javascript
const session = sessionManager.createSession('phase7-testing')

await sessionManager.sendInSession(
  session.id,
  "Run the Phase 7 end-to-end tests"
)

const result = await sessionManager.sendInSession(
  session.id,
  "What were the results?"
)
```

### Example 3: File Transfer + Command
```javascript
// Send local config to remote
await superAgent.sendFile(
  './local-config.json',
  '/home/ubuntu/awsc-new/awesome/config.json'
)

// Ask remote Claude to process it
const response = await superAgent.sendMessage(
  "Read the config.json file I just uploaded and validate it"
)
```

---

## Alternative Approaches Considered

### Alternative 1: Direct SSH Command Execution
**Pros:** Simpler, no queue dependency
**Cons:** Can't leverage existing Slack app infrastructure, no session persistence
**Verdict:** ❌ Doesn't utilize existing proven architecture

### Alternative 2: HTTP API Server
**Pros:** RESTful, scalable
**Cons:** Requires new server component, more complex setup
**Verdict:** ⚠️ Overkill for two-agent communication

### Alternative 3: Shared Database
**Pros:** Atomic operations, SQL queries
**Cons:** Requires DB setup, more infrastructure
**Verdict:** ❌ Too heavy for this use case

### **Selected Approach: Message Queue via Slack App**
**Pros:**
- ✅ Reuses existing, proven infrastructure
- ✅ Simple JSON file format
- ✅ Already has remote Claude monitoring
- ✅ Built-in session management (session names)
- ✅ Audit trail in processed array

**Cons:**
- ⚠️ Polling introduces latency (5s intervals)
- ⚠️ File locking needed for concurrent access

**Verdict:** ✅ **Best fit** - leverages existing infrastructure with minimal new code

---

## Success Criteria

### MVP Requirements
1. ✅ Local Claude can send message to remote queue
2. ✅ Remote Claude processes message (existing behavior)
3. ✅ Local Claude retrieves response
4. ✅ End-to-end roundtrip < 30 seconds (excluding remote processing time)

### Production Requirements
1. ✅ Concurrent message support (multiple queries)
2. ✅ Session persistence across restarts
3. ✅ Error recovery and retry logic
4. ✅ File transfer capability
5. ✅ CLI interface for manual testing

---

## Future Enhancements

### Phase 2 Features (Post-MVP)
- **Bidirectional Streaming:** Remote Claude can also query local Claude
- **Rich Media Support:** Send screenshots, PDFs to remote
- **Queue Prioritization:** High-priority messages processed first
- **Multiple Remote Agents:** Connect to different remote Claude instances
- **Web Dashboard:** Monitor message queue in browser

### Integration Opportunities
- **CI/CD Pipeline:** Remote Claude runs tests, reports to local
- **Distributed Task Queue:** Load balance work across multiple Claudes
- **Collaborative Debugging:** Two Claudes analyze different parts of codebase

---

## Appendix

### A. Message Queue Schema

```typescript
interface Message {
  id: number;              // Timestamp-based unique ID
  query: string;           // The actual query/command
  channel: string;         // Origin channel/identifier
  messageTs: string;       // Slack message timestamp (or generated)
  timestamp: string;       // ISO 8601 timestamp
  user: string;            // Originating user/agent
  images?: Array<any>;     // Optional image attachments
  imageCount: number;      // Count of images
  response?: string;       // Response (only in processed)
  respondedAt?: string;    // Response timestamp (only in processed)
}

interface MessageQueue {
  pending: Message[];
  processed: Message[];
  clearedAt?: string;
  clearedReason?: string;
}
```

### B. File Structure

```
super-agent/
├── .env
├── package.json
├── src/
│   ├── super-agent.js       # Core agent class
│   ├── session-manager.js   # Session tracking
│   ├── file-transfer.js     # SCP wrappers
│   ├── cli.js               # CLI interface
│   └── utils/
│       ├── ssh.js           # SSH helpers
│       ├── queue.js         # Queue operations
│       └── validation.js    # Input validation
├── test/
│   ├── super-agent.test.js
│   ├── session.test.js
│   └── integration.test.js
├── examples/
│   ├── simple-query.js
│   ├── session-work.js
│   └── file-transfer.js
└── DESIGN_PROPOSAL.md       # This document
```

### C. Dependencies

```json
{
  "dependencies": {
    "dotenv": "^16.0.0",
    "node-ssh": "^13.0.0"
  },
  "devDependencies": {
    "jest": "^29.0.0",
    "eslint": "^8.0.0"
  }
}
```

---

## Questions for Review

1. **Polling Interval:** Is 5 seconds acceptable, or do we need real-time?
2. **Concurrency:** Should we support multiple local Claudes writing to the same queue?
3. **Authentication:** Do we need message-level auth, or is SSH sufficient?
4. **Persistence:** Should we cache messages locally for offline review?
5. **Monitoring:** Do we need logging/metrics for message throughput?

---

## Next Steps

Once this proposal is approved:

1. **Setup:** Initialize Node.js project structure
2. **Implement:** Follow Phase 1-5 implementation plan
3. **Test:** Run integration tests with remote Claude
4. **Document:** Create user guide and API docs
5. **Deploy:** Package as npm module for reuse

---

**Proposal Status:** ✅ Ready for Review
**Estimated Development Time:** 9-10 hours
**Risk Level:** Low (leverages existing infrastructure)
**Recommended Approval:** ✅ Proceed with implementation
