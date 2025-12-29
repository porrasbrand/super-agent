#!/bin/bash
#
# start-service.sh - Start PM2 task watcher service
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Create logs directory if it doesn't exist
mkdir -p logs

echo "🚀 Starting super-agent task watcher service..."
echo ""

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
  echo "❌ PM2 not installed"
  echo "Install with: npm install -g pm2"
  exit 1
fi

# Start the service
pm2 start ecosystem.config.cjs

echo ""
echo "✅ Service started"
echo ""
echo "Useful commands:"
echo "  pm2 status              - View service status"
echo "  pm2 logs                - View logs"
echo "  pm2 stop super-agent-watcher   - Stop service"
echo "  pm2 restart super-agent-watcher - Restart service"
echo "  ./scripts/check-status.sh       - Check task status"
