#!/bin/bash
###############################################################################
# Super-Agent Startup Script
#
# This script starts all required processes for the Super-Agent system:
#   1. Webhook notification server
#   2. Remote health monitor (via systemd)
#   3. Verifies remote connectivity
#
# Usage: ./start-super-agent.sh
#        ./start-super-agent.sh --status (check status only)
###############################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}ℹ${NC}  $1"
}

log_success() {
    echo -e "${GREEN}✅${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC}  $1"
}

log_error() {
    echo -e "${RED}❌${NC} $1"
}

# Status check mode
if [ "$1" == "--status" ]; then
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║           SUPER-AGENT SYSTEM STATUS                        ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""

    # Check webhook server
    if pgrep -f "notification-server-standalone.js" > /dev/null; then
        PID=$(pgrep -f "notification-server-standalone.js")
        log_success "Webhook Server: RUNNING (PID: $PID)"
    else
        log_error "Webhook Server: NOT RUNNING"
    fi

    # Check monitoring service
    if systemctl is-active --quiet remote-claude-monitor 2>/dev/null; then
        log_success "Health Monitor: RUNNING (systemd)"
    else
        log_warning "Health Monitor: NOT INSTALLED or NOT RUNNING"
        echo "          Run: sudo ./install-monitoring.sh"
    fi

    # Check remote status
    if [ -f /tmp/remote-status.json ]; then
        STATUS=$(cat /tmp/remote-status.json | grep -o '"isHealthy":[^,]*' | cut -d':' -f2)
        if [ "$STATUS" == "true" ]; then
            log_success "Remote Claude: HEALTHY"
        else
            log_warning "Remote Claude: FROZEN or UNHEALTHY"
        fi
    else
        log_warning "Remote Status: Unknown (monitor not running)"
    fi

    echo ""
    exit 0
fi

echo "╔════════════════════════════════════════════════════════════╗"
echo "║           STARTING SUPER-AGENT SYSTEM                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Check if webhook server is running
log_info "Step 1: Checking Webhook Notification Server..."
if pgrep -f "notification-server-standalone.js" > /dev/null; then
    PID=$(pgrep -f "notification-server-standalone.js")
    log_success "Webhook server already running (PID: $PID)"
else
    log_warning "Webhook server not running, starting it..."

    if [ ! -f "src/notification-server-standalone.js" ]; then
        log_error "src/notification-server-standalone.js not found in $SCRIPT_DIR"
        exit 1
    fi

    # Start webhook server in background
    nohup node src/notification-server-standalone.js >> /tmp/webhook-server.log 2>&1 &
    sleep 2

    if pgrep -f "notification-server-standalone.js" > /dev/null; then
        PID=$(pgrep -f "notification-server-standalone.js")
        log_success "Webhook server started (PID: $PID)"
    else
        log_error "Failed to start webhook server. Check /tmp/webhook-server.log"
        exit 1
    fi
fi

# Step 2: Check monitoring service
echo ""
log_info "Step 2: Checking Remote Health Monitor..."
if systemctl is-active --quiet remote-claude-monitor 2>/dev/null; then
    log_success "Health monitor service is running"
else
    log_warning "Health monitor NOT running"
    echo "          To install: sudo ./install-monitoring.sh"
    echo "          To start:   sudo systemctl start remote-claude-monitor"
fi

# Step 3: Verify dependencies
echo ""
log_info "Step 3: Verifying dependencies..."

# Check Node.js
if command -v node >/dev/null 2>&1; then
    NODE_VERSION=$(node --version)
    log_success "Node.js installed: $NODE_VERSION"
else
    log_error "Node.js not installed"
    exit 1
fi

# Check required files
REQUIRED_FILES=("send-message.js" "webhook-notifier.js" "recover-remote.sh" "monitor-remote-health.cjs")
for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        log_success "Found: $file"
    else
        log_error "Missing: $file"
        exit 1
    fi
done

# Step 4: Check SSH connectivity to remote
echo ""
log_info "Step 4: Testing remote connectivity..."
if timeout 5 /mnt/c/Windows/System32/OpenSSH/ssh.exe -i 'C:\Users\mp\.ssh\id_remote_claude' -p 2222 ubuntu@ssh.manuelporras.com 'echo "OK"' 2>/dev/null | grep -q "OK"; then
    log_success "Remote SSH connection: OK"
else
    log_warning "Remote SSH connection: FAILED or SLOW"
    log_info "Remote may be down or network issue"
fi

# Step 5: Show status summary
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║               SUPER-AGENT STARTUP COMPLETE                 ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📊 System Status:"
echo "   • Webhook Server:   $(pgrep -f notification-server-standalone.js >/dev/null && echo '✅ RUNNING' || echo '❌ STOPPED')"
echo "   • Health Monitor:   $(systemctl is-active --quiet remote-claude-monitor 2>/dev/null && echo '✅ RUNNING' || echo '⚠️  NOT INSTALLED')"
echo "   • Remote Claude:    $([ -f /tmp/remote-status.json ] && (cat /tmp/remote-status.json | grep -q '"isHealthy":true' && echo '✅ HEALTHY' || echo '⚠️  FROZEN') || echo '⚠️  UNKNOWN')"
echo ""
echo "📝 Logs:"
echo "   • Webhook:  tail -f /tmp/claude/-home-mp-awesome-super-agent/tasks/be7f9b7.output"
echo "   • Monitor:  sudo journalctl -u remote-claude-monitor -f"
echo "   • Health:   tail -f /tmp/remote-health.log"
echo ""
echo "🔧 Commands:"
echo "   • Status:   ./start-super-agent.sh --status"
echo "   • Install monitor: sudo ./install-monitoring.sh"
echo "   • Send message: node send-message.js 'your message'"
echo ""
