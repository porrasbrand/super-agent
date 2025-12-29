#!/bin/bash
#
# get-result.sh - Get result of last completed task
# Usage: ./get-result.sh [task-id]
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
QUEUE_FILE="$PROJECT_DIR/tasks/queue.json"

TASK_ID="${1:-}"

if [ -z "$TASK_ID" ]; then
  # No ID provided - get latest completed
  echo "📋 Latest Completed Task"
  echo "========================"
  echo ""

  node -e "
const fs = require('fs');
const queue = JSON.parse(fs.readFileSync('$QUEUE_FILE', 'utf8'));

if (queue.completed.length === 0) {
  console.log('❌ No completed tasks found');
  process.exit(1);
}

const latest = queue.completed[queue.completed.length - 1];
console.log('ID:        ', latest.id);
console.log('Task:      ', latest.task);
console.log('Result:    ', latest.result);
console.log('Completed: ', latest.completed);
"
else
  # Specific ID requested
  echo "📋 Task Result: $TASK_ID"
  echo "========================"
  echo ""

  node -e "
const fs = require('fs');
const queue = JSON.parse(fs.readFileSync('$QUEUE_FILE', 'utf8'));

const task = queue.completed.find(t => t.id === $TASK_ID);

if (!task) {
  console.log('❌ Task $TASK_ID not found in completed tasks');
  process.exit(1);
}

console.log('ID:        ', task.id);
console.log('Task:      ', task.task);
console.log('Result:    ', task.result);
console.log('Completed: ', task.completed);
"
fi
