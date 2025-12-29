#!/bin/bash
#
# add-task.sh - Add task to queue for PM2 service to process
# Usage: ./add-task.sh "task description"
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
QUEUE_FILE="$PROJECT_DIR/tasks/queue.json"

if [ -z "$1" ]; then
  echo "Usage: $0 \"task description\""
  exit 1
fi

TASK="$1"
TASK_ID=$(date +%s%3N)

echo "➕ Adding task to queue..."
echo "Task: ${TASK:0:60}..."
echo "ID: $TASK_ID"
echo ""

# Use Node.js to properly add to queue JSON
node -e "
const fs = require('fs');
const queue = JSON.parse(fs.readFileSync('$QUEUE_FILE', 'utf8'));

queue.pending.push({
  id: $TASK_ID,
  task: '$TASK',
  options: {},
  created: new Date().toISOString()
});

fs.writeFileSync('$QUEUE_FILE', JSON.stringify(queue, null, 2));
console.log('✅ Task added to queue (ID: $TASK_ID)');
console.log('PM2 service will process it automatically');
"
