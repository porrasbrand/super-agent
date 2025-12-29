#!/usr/bin/env node
/**
 * Super-Agent CLI
 *
 * Usage:
 *   node src/cli.js send "What time is it?"
 *   node src/cli.js status
 *   node src/cli.js history
 */

import SuperAgent from './super-agent.js';

const args = process.argv.slice(2);
const command = args[0];

const agent = new SuperAgent();

async function main() {
  try {
    switch (command) {
      case 'send': {
        const query = args.slice(1).join(' ');

        if (!query) {
          console.error('Usage: node src/cli.js send "your query here"');
          process.exit(1);
        }

        console.log('📤 Sending message to remote Claude...\n');

        const response = await agent.sendMessage(query);

        console.log('\n📥 Response:\n');
        console.log(response);
        console.log('');

        break;
      }

      case 'status': {
        const status = await agent.getStatus();

        console.log('\n📊 Queue Status:\n');
        console.log(JSON.stringify(status, null, 2));
        console.log('');

        break;
      }

      case 'history': {
        const limit = parseInt(args[1]) || 10;
        const history = await agent.getHistory(limit);

        console.log(`\n📜 Last ${limit} Messages:\n`);

        history.forEach((msg, i) => {
          console.log(`${i + 1}. [${msg.id}] ${msg.query.substring(0, 60)}...`);
          console.log(`   Response: ${msg.response?.substring(0, 100)}...`);
          console.log(`   Time: ${msg.respondedAt || 'pending'}`);
          console.log('');
        });

        break;
      }

      default:
        console.log('Super-Agent CLI\n');
        console.log('Commands:');
        console.log('  send "query"     - Send message to remote Claude');
        console.log('  status           - Get queue status');
        console.log('  history [limit]  - Show message history');
        console.log('');
        console.log('Examples:');
        console.log('  node src/cli.js send "What time is it?"');
        console.log('  node src/cli.js status');
        console.log('  node src/cli.js history 5');
        console.log('');
    }

    await agent.cleanup();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    await agent.cleanup();
    process.exit(1);
  }
}

main();
