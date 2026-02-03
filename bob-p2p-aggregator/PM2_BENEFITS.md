# Why PM2 Instead of Systemd?

## PM2 Benefits

### 1. **Auto-Restart on Crash** ✅
```javascript
// ecosystem.config.js
{
  autorestart: true,
  max_restarts: 10,
  min_uptime: "10s"
}
```

- Automatically restarts if process crashes
- Won't restart if crashes within 10 seconds (prevents restart loops)
- Max 10 restarts before giving up
- Exponential backoff between restarts

### 2. **Starts on System Boot** ✅
```bash
pm2 startup systemd  # One-time setup
pm2 save            # Save current process list
```

- Integrated with systemd
- Automatically starts after server reboot
- Resurrects all saved processes

### 3. **Zero-Downtime Restarts** ⚡
```bash
pm2 restart bob-aggregator
```

- Graceful shutdown of old process
- New process starts before old one dies
- No dropped requests during updates

### 4. **Built-in Logging** 📝
```bash
pm2 logs bob-aggregator          # Live logs
pm2 logs bob-aggregator --lines 100  # Last 100 lines
```

- Automatic log rotation
- Separate error and output logs
- Timestamps on all logs
- No need to configure journalctl

### 5. **Process Monitoring** 📊
```bash
pm2 monit  # Real-time dashboard
pm2 list   # Process list
pm2 info bob-aggregator  # Detailed info
```

Shows:
- CPU usage
- Memory usage
- Restart count
- Uptime
- Status

### 6. **Memory Management** 💾
```javascript
{
  max_memory_restart: "512M"
}
```

- Automatically restarts if memory exceeds 512MB
- Prevents memory leaks from crashing the VM
- Useful for E2-micro (only 1GB RAM)

---

## Systemd vs PM2 Comparison

| Feature | Systemd | PM2 |
|---------|---------|-----|
| **Auto-restart on crash** | ✅ | ✅ Better (exponential backoff) |
| **Start on boot** | ✅ | ✅ Via systemd integration |
| **Zero-downtime restart** | ❌ | ✅ |
| **Built-in logging** | ✅ journalctl | ✅ pm2 logs (simpler) |
| **Log rotation** | Manual config | ✅ Automatic |
| **Process monitoring** | ❌ Need external tools | ✅ Built-in |
| **Memory limits** | Manual config | ✅ Simple config |
| **Multiple instances** | Complex | ✅ Easy (cluster mode) |
| **Development mode** | ❌ | ✅ Watch mode |
| **Learning curve** | Steeper | Gentler |

---

## PM2 Commands Reference

### Basic Management
```bash
pm2 start ecosystem.config.js   # Start from config
pm2 restart bob-aggregator      # Restart (zero-downtime)
pm2 stop bob-aggregator          # Stop
pm2 delete bob-aggregator        # Remove from PM2
pm2 reload bob-aggregator        # Reload (0-downtime)
```

### Monitoring
```bash
pm2 list                         # All processes
pm2 info bob-aggregator          # Detailed info
pm2 monit                        # Live dashboard
pm2 logs bob-aggregator          # Live logs
pm2 logs bob-aggregator --lines 100  # Last 100 lines
pm2 logs bob-aggregator --err    # Error logs only
```

### Startup Management
```bash
pm2 startup                      # Generate startup script
pm2 save                         # Save current processes
pm2 resurrect                    # Restore saved processes
pm2 unstartup                    # Remove startup script
```

### Advanced
```bash
pm2 scale bob-aggregator 4       # Run 4 instances (cluster)
pm2 reset bob-aggregator         # Reset restart counter
pm2 flush                        # Clear all logs
```

---

## Our PM2 Configuration

```javascript
// /opt/bob-aggregator/ecosystem.config.js
module.exports = {
  apps: [{
    name: "bob-aggregator",
    script: "src/index.js",
    args: "--config config.json",
    cwd: "/opt/bob-aggregator",
    instances: 1,                 // Single instance
    autorestart: true,            // Restart on crash
    watch: false,                 // No file watching (production)
    max_memory_restart: "512M",   // Restart if > 512MB
    env: {
      NODE_ENV: "production"
    },
    error_file: "/opt/bob-aggregator/logs/error.log",
    out_file: "/opt/bob-aggregator/logs/out.log",
    log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    merge_logs: true,
    max_restarts: 10,             // Max restart attempts
    min_uptime: "10s",            // Must run 10s to be stable
    listen_timeout: 3000,
    kill_timeout: 5000
  }]
};
```

---

## Real-World Benefits

### Scenario 1: Uncaught Exception
```javascript
// Aggregator crashes due to bug
throw new Error("Unexpected error");
```

**Systemd**: Service stops. You must SSH and manually restart.
**PM2**: Automatically restarts in 100ms. Zero manual intervention.

### Scenario 2: Memory Leak
```javascript
// Slowly leaking memory
setInterval(() => {
  leakingArray.push(new Buffer(1024));
}, 1000);
```

**Systemd**: VM runs out of memory, crashes, requires SSH to fix.
**PM2**: Restarts process at 512MB, prevents VM crash.

### Scenario 3: Server Reboot
```bash
sudo reboot
```

**Systemd**: Configured service restarts automatically.
**PM2**: Same, but via `pm2 startup` integration.

### Scenario 4: Update/Deploy
```bash
./update.sh
```

**Systemd**: `systemctl restart` = brief downtime.
**PM2**: `pm2 restart` = zero-downtime reload.

### Scenario 5: Debugging
```bash
# See what's happening
```

**Systemd**: `journalctl -u bob-aggregator -f` (verbose)
**PM2**: `pm2 logs bob-aggregator` (cleaner output)

---

## Production Recommendations

### For High Availability

Enable cluster mode (multiple instances):
```javascript
{
  instances: 2,  // or "max" for all CPU cores
  exec_mode: "cluster"
}
```

Benefits:
- Load balancing across instances
- Zero-downtime deployments
- Better CPU utilization

**Note**: E2-micro has only 1 vCPU, so single instance is fine.

### For Monitoring

Install PM2 Plus (optional, paid):
```bash
pm2 plus
```

- Web dashboard
- Email alerts
- Historical metrics
- Anomaly detection

Or use free alternatives:
- Grafana + Prometheus
- New Relic
- DataDog

---

## Why Not Plain Node.js?

### Running directly:
```bash
node src/index.js --config config.json
```

**Problems:**
- ❌ No auto-restart on crash
- ❌ Must manually start after reboot
- ❌ No built-in logging
- ❌ No process monitoring
- ❌ Stops when you close SSH session

### Using `nohup`:
```bash
nohup node src/index.js --config config.json > aggregator.log 2>&1 &
```

**Problems:**
- ❌ Still no auto-restart
- ❌ Still no boot startup
- ⚠️ Manual log management
- ⚠️ Hard to monitor
- ⚠️ Process management is manual

### Using Systemd:
✅ Auto-restart
✅ Boot startup
✅ Logging via journalctl
⚠️ No zero-downtime
⚠️ Complex configuration
⚠️ Harder to debug

### Using PM2:
✅ Auto-restart with exponential backoff
✅ Boot startup via systemd integration
✅ Simple logging with rotation
✅ Zero-downtime restarts
✅ Built-in monitoring
✅ Memory management
✅ Easy to use

---

## Summary

PM2 provides:
1. **Better reliability** - Smart auto-restart logic
2. **Easier operations** - Simple commands for common tasks
3. **Better monitoring** - Built-in dashboard and logs
4. **Zero-downtime** - Updates without dropping requests
5. **Memory safety** - Automatic restart before OOM

It's the **Node.js process manager** designed specifically for production, combining the best of systemd with Node.js-specific features.

**Bottom line**: Use PM2 for Node.js applications in production. It's industry standard for a reason.
