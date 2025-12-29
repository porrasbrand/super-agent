#!/bin/bash
#
# send-message.sh - Send message directly to remote Claude
# Usage: ./send-message.sh "your message here"
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

if [ -z "$1" ]; then
  echo "Usage: $0 \"message text\""
  exit 1
fi

MESSAGE="$1"

echo "📤 Sending message to remote Claude..."
echo "Message: ${MESSAGE:0:60}..."
echo ""

cd "$PROJECT_DIR"
node src/cli.js send "$MESSAGE"
