#!/bin/bash
#
# stop-service.sh - Stop PM2 task watcher service
#

set -e

echo "🛑 Stopping super-agent task watcher service..."

pm2 stop super-agent-watcher

echo "✅ Service stopped"
