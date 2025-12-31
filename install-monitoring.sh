#!/bin/bash
###############################################################################
# Remote Claude Monitoring System - Installation Script
#
# This script installs the monitoring system as a systemd service.
# Requires sudo privileges.
#
# Usage: sudo ./install-monitoring.sh
###############################################################################

set -e  # Exit on error

if [ "$EUID" -ne 0 ]; then
  echo "❌ Error: This script must be run with sudo"
  echo "Usage: sudo ./install-monitoring.sh"
  exit 1
fi

echo "╔════════════════════════════════════════════════════════════╗"
echo "║   Remote Claude Monitoring System - Installation          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Copy systemd service file
echo "📋 Step 1: Installing systemd service file..."
cp /home/mp/awesome/super-agent/remote-claude-monitor.service /etc/systemd/system/
echo "✅ Service file copied to /etc/systemd/system/"

# Step 2: Reload systemd
echo ""
echo "🔄 Step 2: Reloading systemd daemon..."
systemctl daemon-reload
echo "✅ Systemd reloaded"

# Step 3: Enable service (start on boot)
echo ""
echo "⚙️  Step 3: Enabling service (auto-start on boot)..."
systemctl enable remote-claude-monitor
echo "✅ Service enabled"

# Step 4: Start service
echo ""
echo "🚀 Step 4: Starting monitoring service..."
systemctl start remote-claude-monitor
echo "✅ Service started"

# Step 5: Check status
echo ""
echo "📊 Step 5: Verifying service status..."
sleep 2
systemctl status remote-claude-monitor --no-pager -l

# Step 6: Create log files with correct permissions
echo ""
echo "📝 Step 6: Setting up log files..."
touch /var/log/remote-claude-monitor.log
touch /var/log/remote-claude-monitor-error.log
chown mp:mp /var/log/remote-claude-monitor*.log
chmod 644 /var/log/remote-claude-monitor*.log
echo "✅ Log files created"

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              INSTALLATION COMPLETE ✅                       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📊 Monitor status:     sudo systemctl status remote-claude-monitor"
echo "📜 View logs:          sudo journalctl -u remote-claude-monitor -f"
echo "📝 Health log:         tail -f /tmp/remote-health.log"
echo "🔄 Restart service:    sudo systemctl restart remote-claude-monitor"
echo "🛑 Stop service:       sudo systemctl stop remote-claude-monitor"
echo ""
echo "📚 Documentation:      /home/mp/awesome/super-agent/docs/remote-monitoring-system.md"
echo ""
