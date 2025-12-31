#!/bin/bash
###############################################################################
# Super-Agent Complete Installation Script
#
# Installs all systemd services for auto-start on boot:
#   1. Webhook Notification Server
#   2. Remote Health Monitor
#
# Usage: sudo ./install-all-services.sh
###############################################################################

set -e

if [ "$EUID" -ne 0 ]; then
  echo "❌ Error: This script must be run with sudo"
  echo "Usage: sudo ./install-all-services.sh"
  exit 1
fi

echo "╔════════════════════════════════════════════════════════════╗"
echo "║      Super-Agent Complete Installation (Systemd)          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Install Webhook Server Service
echo "📋 Step 1: Installing Webhook Server Service..."
if [ ! -f "/home/mp/awesome/super-agent/webhook-server.service" ]; then
    echo "❌ webhook-server.service not found"
    exit 1
fi

cp /home/mp/awesome/super-agent/webhook-server.service /etc/systemd/system/
echo "✅ Webhook service file copied"

# Step 2: Install Health Monitor Service
echo ""
echo "📋 Step 2: Installing Health Monitor Service..."
if [ ! -f "/home/mp/awesome/super-agent/remote-claude-monitor.service" ]; then
    echo "❌ remote-claude-monitor.service not found"
    exit 1
fi

cp /home/mp/awesome/super-agent/remote-claude-monitor.service /etc/systemd/system/
echo "✅ Monitor service file copied"

# Step 3: Reload systemd
echo ""
echo "🔄 Step 3: Reloading systemd daemon..."
systemctl daemon-reload
echo "✅ Systemd reloaded"

# Step 4: Enable services (auto-start on boot)
echo ""
echo "⚙️  Step 4: Enabling services (auto-start on boot)..."
systemctl enable webhook-server
systemctl enable remote-claude-monitor
echo "✅ Services enabled"

# Step 5: Stop any existing processes
echo ""
echo "🛑 Step 5: Stopping any existing processes..."
# Stop old webhook process if running
pkill -f "webhook-notifier.js" 2>/dev/null || true
sleep 1

# Step 6: Start services
echo ""
echo "🚀 Step 6: Starting services..."
systemctl start webhook-server
systemctl start remote-claude-monitor
sleep 2
echo "✅ Services started"

# Step 7: Create log files with correct permissions
echo ""
echo "📝 Step 7: Setting up log files..."
touch /var/log/remote-claude-monitor.log
touch /var/log/remote-claude-monitor-error.log
touch /tmp/webhook-server.log
touch /tmp/webhook-server-error.log
chown mp:mp /var/log/remote-claude-monitor*.log
chown mp:mp /tmp/webhook-server*.log
chmod 644 /var/log/remote-claude-monitor*.log
chmod 644 /tmp/webhook-server*.log
echo "✅ Log files created"

# Step 8: Verify services are running
echo ""
echo "✓ Step 8: Verifying services..."
sleep 2

if systemctl is-active --quiet webhook-server; then
    echo "✅ Webhook Server: RUNNING"
else
    echo "❌ Webhook Server: FAILED TO START"
    systemctl status webhook-server --no-pager -l
fi

if systemctl is-active --quiet remote-claude-monitor; then
    echo "✅ Health Monitor: RUNNING"
else
    echo "❌ Health Monitor: FAILED TO START"
    systemctl status remote-claude-monitor --no-pager -l
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              INSTALLATION COMPLETE ✅                       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📊 Service Status:"
echo "   • Webhook Server:   systemctl status webhook-server"
echo "   • Health Monitor:   systemctl status remote-claude-monitor"
echo ""
echo "📜 View Logs:"
echo "   • Webhook:  tail -f /tmp/webhook-server.log"
echo "   • Monitor:  tail -f /var/log/remote-claude-monitor.log"
echo "   • Combined: sudo journalctl -u webhook-server -u remote-claude-monitor -f"
echo ""
echo "🔧 Service Management:"
echo "   • Start all:   sudo systemctl start webhook-server remote-claude-monitor"
echo "   • Stop all:    sudo systemctl stop webhook-server remote-claude-monitor"
echo "   • Restart all: sudo systemctl restart webhook-server remote-claude-monitor"
echo "   • Status all:  ./start-super-agent.sh --status"
echo ""
echo "🔄 Both services will now auto-start on system boot!"
echo ""
