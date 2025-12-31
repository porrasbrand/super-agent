#!/bin/bash
###############################################################################
# Remote Claude Auto-Recovery Script
#
# Attempts to restart frozen remote Claude CLI process through progressive
# recovery strategies.
#
# Recovery Stages:
#   1. Graceful restart (Ctrl-C + clean restart)
#   2. Force kill (pkill -9)
#   3. Alert for manual intervention
#
# Author: Super-Agent System
# Version: 1.0.0
###############################################################################

set -u  # Exit on undefined variables

# Configuration
LOG_FILE="/tmp/recovery.log"
MAX_RECOVERY_ATTEMPTS=3
RECOVERY_ATTEMPT_FILE="/tmp/recovery-attempts.txt"
RECOVERY_LOCKFILE="/tmp/recovery.lock"
SSH_HOST="ssh.manuelporras.com"
SSH_PORT="2222"
SSH_USER="ubuntu"
SSH_KEY="$HOME/.ssh/id_remote_claude"
REMOTE_WORKDIR="/home/ubuntu/awsc-new/awesome/seo-processor-worker"
TMUX_SESSION="seo"

# Logging function
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Get current recovery attempt count
get_recovery_attempts() {
  if [ ! -f "$RECOVERY_ATTEMPT_FILE" ]; then
    echo "0" > "$RECOVERY_ATTEMPT_FILE"
  fi
  cat "$RECOVERY_ATTEMPT_FILE"
}

# Increment recovery attempt counter
increment_recovery_attempts() {
  local attempts=$(get_recovery_attempts)
  echo $((attempts + 1)) > "$RECOVERY_ATTEMPT_FILE"
}

# Reset recovery attempt counter
reset_recovery_attempts() {
  echo "0" > "$RECOVERY_ATTEMPT_FILE"
  log "✅ Recovery attempt counter reset"
}

# Acquire recovery lock to prevent concurrent recoveries
acquire_lock() {
  if [ -f "$RECOVERY_LOCKFILE" ]; then
    local lock_age=$(($(date +%s) - $(stat -c %Y "$RECOVERY_LOCKFILE" 2>/dev/null || echo 0)))
    if [ $lock_age -lt 300 ]; then  # Lock valid for 5 minutes
      log "⏸️  Recovery already in progress (lock age: ${lock_age}s)"
      exit 0
    else
      log "⚠️  Stale recovery lock detected (age: ${lock_age}s) - removing"
      rm -f "$RECOVERY_LOCKFILE"
    fi
  fi

  touch "$RECOVERY_LOCKFILE"
  log "🔒 Recovery lock acquired"
}

# Release recovery lock
release_lock() {
  rm -f "$RECOVERY_LOCKFILE"
  log "🔓 Recovery lock released"
}

# Cleanup on exit
cleanup() {
  release_lock
}
trap cleanup EXIT

# SSH command wrapper with timeout
ssh_exec() {
  local cmd="$1"
  local timeout_duration="${2:-20}"

  # Use Windows SSH proxy from WSL
  timeout "$timeout_duration" /mnt/c/Windows/System32/OpenSSH/ssh.exe \
    -i 'C:\Users\mp\.ssh\id_remote_claude' \
    -p "$SSH_PORT" \
    "$SSH_USER@$SSH_HOST" \
    "$cmd" 2>&1
}

# Check if SSH connection is working
test_ssh_connection() {
  log "Testing SSH connectivity..."

  if ssh_exec "echo 'SSH OK'" 5 | grep -q "SSH OK"; then
    log "✅ SSH connection successful"
    return 0
  else
    log "❌ SSH connection failed"
    return 1
  fi
}

# Strategy 1: Graceful restart
graceful_restart() {
  log "📍 Strategy 1: Graceful restart (Ctrl-C + clean restart)"

  local recovery_cmd=$(cat <<'ENDSSH'
# Send Ctrl-C to Claude in tmux (non-blocking)
tmux send-keys -t seo C-c 2>/dev/null

# Wait a moment for graceful shutdown
sleep 2

# Check if Claude process still running
if pgrep -f 'claude.*seo-processor-worker' >/dev/null; then
  echo "Claude still running after Ctrl-C, sending SIGTERM..."
  pkill -15 -f 'claude.*seo-processor-worker'
  sleep 2
fi

# Kill tmux session if it exists
if tmux has-session -t seo 2>/dev/null; then
  echo "Killing tmux session: seo"
  tmux kill-session -t seo
fi

# Start fresh tmux session with Claude (must cd first, then start claude)
cd /home/ubuntu/awsc-new/awesome/seo-processor-worker || exit 1
tmux new-session -d -s seo
tmux send-keys -t seo "cd /home/ubuntu/awsc-new/awesome/seo-processor-worker && claude --dangerously-skip-permissions" Enter

# Wait for Claude to start
sleep 3

# Verify Claude is running
if tmux has-session -t seo 2>/dev/null && pgrep -f 'claude.*dangerously' >/dev/null; then
  echo "SUCCESS: Remote Claude restarted in tmux session 'seo'"
  exit 0
else
  echo "FAILED: Claude process not running"
  exit 1
fi
ENDSSH
  )

  if ssh_exec "$recovery_cmd" 25 | tee -a "$LOG_FILE" | grep -q "SUCCESS"; then
    log "✅ Graceful restart succeeded"
    return 0
  else
    log "❌ Graceful restart failed"
    return 1
  fi
}

# Strategy 2: Force kill and restart
force_restart() {
  log "📍 Strategy 2: Force kill (pkill -9 + restart)"

  local force_cmd=$(cat <<'ENDSSH'
# Force kill all Claude processes
echo "Force killing Claude processes..."
pkill -9 -f claude 2>/dev/null

# Force kill tmux session
tmux kill-session -t seo 2>/dev/null

# Clean up any remaining processes
sleep 1

# Restart Claude in new tmux session (must cd first, then start claude)
cd /home/ubuntu/awsc-new/awesome/seo-processor-worker || exit 1
tmux new-session -d -s seo
tmux send-keys -t seo "cd /home/ubuntu/awsc-new/awesome/seo-processor-worker && claude --dangerously-skip-permissions" Enter

# Verify restart
sleep 2
if tmux has-session -t seo 2>/dev/null && pgrep -f 'claude.*seo-processor-worker' >/dev/null; then
  echo "SUCCESS: Force restart completed"
  exit 0
else
  echo "FAILED: Force restart did not work"
  exit 1
fi
ENDSSH
  )

  if ssh_exec "$force_cmd" 20 | tee -a "$LOG_FILE" | grep -q "SUCCESS"; then
    log "✅ Force restart succeeded"
    return 0
  else
    log "❌ Force restart failed"
    return 1
  fi
}

# Main recovery logic
main() {
  log "╔════════════════════════════════════════════════════════════╗"
  log "║         REMOTE CLAUDE AUTO-RECOVERY INITIATED              ║"
  log "╚════════════════════════════════════════════════════════════╝"

  # Acquire lock
  acquire_lock

  # Check recovery attempts
  local attempts=$(get_recovery_attempts)
  log "📊 Current recovery attempts: $attempts / $MAX_RECOVERY_ATTEMPTS"

  if [ "$attempts" -ge "$MAX_RECOVERY_ATTEMPTS" ]; then
    log "❌ Maximum recovery attempts ($MAX_RECOVERY_ATTEMPTS) exceeded"
    log "🚨 ALERT: Manual intervention required!"
    log "   → Check server at $SSH_HOST:$SSH_PORT"
    log "   → Verify SSH service is running"
    log "   → Check server resources (CPU, memory, disk)"
    exit 1
  fi

  increment_recovery_attempts
  log "🔄 Recovery attempt #$((attempts + 1)) of $MAX_RECOVERY_ATTEMPTS"

  # Test SSH connectivity first
  if ! test_ssh_connection; then
    log "❌ Cannot connect to remote server via SSH"
    log "   Possible causes:"
    log "   - SSH service down on remote"
    log "   - Network connectivity issue"
    log "   - Firewall blocking port $SSH_PORT"
    log "   - Server completely frozen/offline"
    log ""
    log "🚨 Manual intervention required via server console"
    exit 1
  fi

  # Try graceful restart
  if graceful_restart; then
    reset_recovery_attempts
    log "✅ Recovery successful (graceful)"
    exit 0
  fi

  # Try force restart
  log "⚠️  Graceful restart failed, attempting force restart..."
  if force_restart; then
    reset_recovery_attempts
    log "✅ Recovery successful (force)"
    exit 0
  fi

  # All strategies failed
  log "❌ All recovery strategies failed"
  log "🚨 ALERT: Remote Claude could not be recovered automatically"
  log "   Manual intervention required!"
  exit 1
}

# Run main recovery
main "$@"
