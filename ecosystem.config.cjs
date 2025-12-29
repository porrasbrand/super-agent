/**
 * PM2 Ecosystem File
 *
 * Start service: pm2 start ecosystem.config.cjs
 * Stop service:  pm2 stop super-agent-watcher
 * Logs:          pm2 logs super-agent-watcher
 * Status:        pm2 status
 */

module.exports = {
  apps: [{
    name: 'super-agent-watcher',
    script: './services/task-watcher.js',
    cwd: '/home/mp/awesome/super-agent',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '200M',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};
