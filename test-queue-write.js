import { readFileSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function testQueueWrite() {
  console.log('📝 Testing direct queue write...\n');

  // Read current queue
  console.log('1. Reading remote queue...');
  const readCmd = `~/.ssh/remote-claude-wrapper.sh "cat /home/ubuntu/awsc-new/awesome/slack-app/message-queue.json"`;
  const { stdout } = await execAsync(readCmd);
  const queue = JSON.parse(stdout);

  console.log(`✅ Read queue - Pending: ${queue.pending.length}, Processed: ${queue.processed.length}`);

  // Add test message
  const testMessage = {
    id: Date.now(),
    sessionName: null,
    query: "TEST: What time is it?",
    channel: "super-agent",
    messageTs: Date.now().toString(),
    timestamp: new Date().toISOString(),
    user: "super-agent",
    images: [],
    imageCount: 0
  };

  console.log(`\n2. Adding test message (ID: ${testMessage.id})...`);
  queue.pending.push(testMessage);

  // Write to temp file
  const tmpFile = `/tmp/queue-test-${Date.now()}.json`;
  const fs = await import('fs/promises');
  await fs.writeFile(tmpFile, JSON.stringify(queue, null, 2));
  console.log(`✅ Wrote to temp file: ${tmpFile}`);

  // Copy to remote
  console.log('\n3. Copying to remote via SCP...');
  const scpCmd = `scp -F ~/.ssh/config ${tmpFile} remote-claude:/home/ubuntu/awsc-new/awesome/slack-app/message-queue.json`;
  await execAsync(scpCmd);
  console.log('✅ Copied to remote');

  // Clean up
  await fs.unlink(tmpFile);

  // Verify
  console.log('\n4. Verifying...');
  const { stdout: stdout2 } = await execAsync(readCmd);
  const queue2 = JSON.parse(stdout2);
  console.log(`✅ Verified - Pending: ${queue2.pending.length}, Processed: ${queue2.processed.length}`);

  console.log('\n🎉 Test successful! Message ID:', testMessage.id);
  console.log('\nNow trigger remote Claude to check queue:');
  console.log('  ssh remote-claude');
  console.log('  tmux attach -t seo');
  console.log('  Type: check queue');
}

testQueueWrite().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
