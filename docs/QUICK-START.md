# Remote Monitoring System - Quick Start Guide

## Immediate Actions Needed

### 1. Manual Remote Restart (NOW)

**SSH is currently unreachable**. You need to restart the remote server manually:

**Via Server Control Panel:**
1. Log into your server hosting panel (e.g., AWS Console, DigitalOcean, etc.)
2. Access server console for `ssh.manuelporras.com`
3. Restart SSH service or reboot server
4. Once SSH is accessible, run:

```bash
ssh -i ~/.ssh/id_remote_claude -p 2222 ubuntu@ssh.manuelporras.com

# On remote server:
pkill -9 -f claude
tmux kill-session -t seo
cd /home/ubuntu/awsc-new/awesome/seo-processor-worker
tmux new-session -d -s seo 'claude --dangerously-skip-permissions'

# Verify it's running:
tmux list-sessions
ps aux | grep claude
```

---

## 2. Install Monitoring System (AFTER Remote is Back)

Once remote is accessible again:

```bash
cd /home/mp/awesome/super-agent
sudo ./install-monitoring.sh
```

This will:
- Install systemd service
- Enable auto-start on boot
- Start monitoring immediately
- Set up logs

---

## 3. Verify Installation

```bash
# Check service is running
sudo systemctl status remote-claude-monitor

# Watch live logs
sudo journalctl -u remote-claude-monitor -f

# Check health status
cat /tmp/remote-status.json
```

---

## 4. Monitor Over Time

The system now automatically:
- ✅ Checks remote health every 5 minutes
- ✅ Detects freeze after 10 minutes of inactivity
- ✅ Attempts auto-recovery (3 attempts max)
- ✅ Logs all activity
- ✅ Runs 24/7 as systemd service

**You don't need to do anything** - it monitors and recovers automatically.

---

## What Happens When Remote Freezes

```
Time 0:00  - Remote Claude working normally
Time 0:10  - Remote stops responding (frozen)
Time 0:15  - Health monitor detects freeze (>10 min no activity)
Time 0:15  - Auto-recovery triggered: Strategy 1 (graceful restart)
Time 0:16  - Remote restarted successfully
Time 0:17  - Monitoring resumes normally
```

---

## Important Files

| File | Purpose |
|------|---------|
| `/home/mp/awesome/super-agent/monitor-remote-health.js` | Main monitor (Node.js) |
| `/home/mp/awesome/super-agent/recover-remote.sh` | Recovery script |
| `/home/mp/awesome/super-agent/install-monitoring.sh` | One-time installation |
| `/tmp/remote-status.json` | Current status (real-time) |
| `/tmp/remote-health.log` | Health check history |
| `/tmp/recovery.log` | Recovery attempt logs |
| `/var/log/remote-claude-monitor.log` | Service logs |

---

## Common Commands

```bash
# Start monitoring
sudo systemctl start remote-claude-monitor

# Stop monitoring
sudo systemctl stop remote-claude-monitor

# Restart monitoring
sudo systemctl restart remote-claude-monitor

# View status
sudo systemctl status remote-claude-monitor

# Follow logs
sudo journalctl -u remote-claude-monitor -f

# Check current health
cat /tmp/remote-status.json | jq

# Manual recovery test
sudo -u mp /home/mp/awesome/super-agent/recover-remote.sh

# Reset recovery attempts
echo "0" > /tmp/recovery-attempts.txt
```

---

## Next Steps (Optional - Phase 4)

After monitoring is stable, consider implementing:
- Email/Slack alerts (see docs/remote-monitoring-system.md § 4.3)
- Predictive failure detection (§ 4.2)
- Multi-agent redundancy (§ 4.1)
- Metrics dashboard (§ 4.5)

See full documentation: `/home/mp/awesome/super-agent/docs/remote-monitoring-system.md`

---

## Troubleshooting

**Problem:** Service won't start
```bash
sudo systemctl status remote-claude-monitor
# Check logs for errors
sudo journalctl -u remote-claude-monitor -n 50
```

**Problem:** Recovery always fails
```bash
# Test SSH manually
ssh -i ~/.ssh/id_remote_claude -p 2222 ubuntu@ssh.manuelporras.com
# If that fails, check network/firewall
```

**Problem:** False frozen alerts
```bash
# Check webhook log is updating
tail -f /tmp/claude/-home-mp-awesome-super-agent/tasks/be7f9b7.output
# Increase timeout if needed (edit monitor-remote-health.js)
```

---

## Summary

1. ✅ Monitoring scripts created
2. ✅ Recovery automation implemented
3. ✅ Systemd service configured
4. ✅ Documentation complete
5. ⏳ Awaiting manual remote restart
6. ⏳ Awaiting monitoring installation

**Total setup time:** < 5 minutes after remote is back online
