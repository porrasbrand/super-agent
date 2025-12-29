#!/bin/bash
#
# check-status.sh - Check current task status
# Usage: ./check-status.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
STATUS_FILE="$PROJECT_DIR/tasks/current-status.json"

echo "📊 Current Status"
echo "================="
echo ""

if [ ! -f "$STATUS_FILE" ]; then
  echo "❌ Status file not found"
  exit 1
fi

# Use Node.js to pretty-print status
node -e "
const fs = require('fs');
const status = JSON.parse(fs.readFileSync('$STATUS_FILE', 'utf8'));

console.log('Stats:');
console.log('  Pending:    ', status.stats.pending);
console.log('  Processing: ', status.stats.processing);
console.log('  Completed:  ', status.stats.completed);
console.log('');

if (status.currentTask) {
  console.log('Current Task:');
  console.log('  ID:     ', status.currentTask.id);
  console.log('  Task:   ', status.currentTask.task.substring(0, 60) + '...');
  console.log('  Status: ', status.currentTask.status);
  console.log('  Started:', status.currentTask.started);
  console.log('');
}

if (status.lastCompleted) {
  console.log('Last Completed:');
  console.log('  ID:      ', status.lastCompleted.id);
  console.log('  Task:    ', status.lastCompleted.task.substring(0, 60) + '...');
  console.log('  Result:  ', status.lastCompleted.result.substring(0, 60) + '...');
  console.log('  Done:    ', status.lastCompleted.completed);
}
"
