# Aggregator Deployment Guide

## Quick Start

### 1. Prepare Service Account

Ensure you have your google cloud service account as `gcp.json` in the aggregator directory with these permissions:
- Compute Admin
- Service Account User

### 2. Deploy

```bash
cd /home/julien/Projects/bob-p2p/bob-p2p-aggregator
./deploy.sh
```

### 3. Configure

If config.json wasn't included, SSH to the instance and create it:

```bash
gcloud compute ssh bob-aggregator --zone=us-central1-a
cd /opt/bob-aggregator
nano config.json
```

Copy from `config.example.json` and customize.

### 4. Start Service

```bash
sudo systemctl start bob-aggregator
sudo systemctl status bob-aggregator
```

### 5. Test

```bash
curl http://YOUR_EXTERNAL_IP:8080/health
curl http://YOUR_EXTERNAL_IP:8080/info
```

---

## What Gets Deployed

### VM Specifications
- **Instance**: E2-micro (free tier eligible)
- **OS**: Ubuntu 22.04 LTS
- **Disk**: 10GB standard persistent disk
- **Zone**: us-central1-a
- **Network**: Default VPC with HTTP/HTTPS tags

### Software Stack
- **Node.js**: 18.x LTS
- **Process Manager**: PM2 (auto-restart, boot startup, monitoring)
- **Database**: SQLite (stored in `/opt/bob-aggregator/data/`)
- **Logs**: PM2 logs with automatic rotation

### File Locations
```
/opt/bob-aggregator/          # Application directory
├── src/                       # Source code
├── config.json               # Configuration
├── node_modules/             # Dependencies
├── package.json              # Package definition
├── ecosystem.config.js       # PM2 configuration
├── data/                     # SQLite database directory
└── logs/                     # PM2 logs
    ├── error.log             # Error output
    └── out.log               # Standard output
```

### PM2 Features
- **Auto-restart**: Restarts on crash with exponential backoff
- **Boot startup**: Starts automatically when VM reboots
- **Memory management**: Restarts if memory exceeds 512MB
- **Zero-downtime**: Updates without dropping requests
- **Monitoring**: Built-in dashboard and metrics

---

## Deployment Script Details

### What `deploy.sh` Does

1. **Validates** service account file exists
2. **Authenticates** with GCP using service account
3. **Creates VM** (or checks if exists)
4. **Creates firewall rule** for port 8080
5. **Uploads files** to VM (excludes node_modules, .git)
6. **Installs Node.js** 18 on the VM
7. **Installs PM2** globally
8. **Installs dependencies** with npm
9. **Creates PM2 ecosystem config** for auto-restart and monitoring
10. **Sets up PM2 startup** to start on boot
11. **Starts service** with PM2 (if config.json exists)
12. **Tests health endpoint**
13. **Displays** connection info and PM2 commands

### Files Excluded from Upload
- `node_modules/` (reinstalled on server)
- `.git/` (not needed in production)
- `*.log` (temporary files)
- `gcp.json` (sensitive)
- `deploy.sh` and `update.sh` (not needed on server)

### Firewall Configuration

The script creates this firewall rule:
```
Name: allow-http-aggregator
Direction: INGRESS
Priority: 1000
Target: http-server tagged instances
Allowed: tcp:8080
Source: 0.0.0.0/0 (public internet)
```

---

## Configuration Management

### Option 1: Include config.json Before Deploy

```bash
# Edit config.json locally
nano config.json

# Deploy (will include config.json)
./deploy.sh
```

### Option 2: Create config.json After Deploy

```bash
# Deploy without config
./deploy.sh

# SSH and create config
gcloud compute ssh bob-aggregator --zone=us-central1-a
cd /opt/bob-aggregator
cp config.example.json config.json
nano config.json

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
```

### Required Configuration

At minimum, configure:
- `wallet.address` - Your Solana wallet public key
- `wallet.privateKey` - Your wallet private key (mnemonic, array, or base58)
- `database.path` - Use `/opt/bob-aggregator/data/aggregator.db`
- `server.port` - Keep as 8080 (firewall configured for this)

---

## Updating the Deployment

### Quick Update

```bash
./update.sh
```

This preserves your `config.json` and only updates code.

### Manual Update

```bash
# SSH to instance
gcloud compute ssh bob-aggregator --zone=us-central1-a

# Update code
cd /opt/bob-aggregator
sudo systemctl stop bob-aggregator

# Pull changes (if using git)
git pull origin main

# Or manually upload files
# (exit SSH and run from local machine)
gcloud compute scp --recurse ./src bob-aggregator:/opt/bob-aggregator/

# Back on server
cd /opt/bob-aggregator
npm install --production
sudo systemctl start bob-aggregator
```

---

## Monitoring

### View Logs

```bash
# Live logs (all output)
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='pm2 logs bob-aggregator'

# Last 100 lines
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='pm2 logs bob-aggregator --lines 100'

# Error logs only
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='pm2 logs bob-aggregator --err'

# Clear all logs
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='pm2 flush'
```

### Check Service Status

```bash
# List all PM2 processes
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='pm2 list'

# Detailed info (uptime, restarts, memory, CPU)
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='pm2 info bob-aggregator'

# Real-time monitoring dashboard
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='pm2 monit'
```

### Check Resource Usage

```bash
# PM2 built-in monitoring (best option)
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='pm2 monit'

# Detailed PM2 info
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='pm2 info bob-aggregator'

# System resources
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='
    echo "=== CPU & Memory ==="
    top -bn1 | head -20
    echo ""
    echo "=== Disk Usage ==="
    df -h
    echo ""
    echo "=== Database Size ==="
    du -h /opt/bob-aggregator/data/*.db
    echo ""
    echo "=== PM2 Restart Count ==="
    pm2 info bob-aggregator | grep restart
'
```

### Health Endpoints

```bash
# From local machine
EXTERNAL_IP=$(gcloud compute instances describe bob-aggregator --zone=us-central1-a --format='get(networkInterfaces[0].accessConfigs[0].natIP)')

curl http://$EXTERNAL_IP:8080/health
curl http://$EXTERNAL_IP:8080/info
curl http://$EXTERNAL_IP:8080/api/search
```

---

## Troubleshooting

### Service Won't Start

```bash
# Check PM2 logs for errors
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='pm2 logs bob-aggregator --lines 50'

# Check if process is running
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='pm2 list'

# View detailed error info
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='pm2 info bob-aggregator'

# Common issues:
# - Missing config.json
# - Invalid config format
# - Database permission errors
# - Port already in use
# - Too many restarts (check restart count)
```

### Service Keeps Restarting

```bash
# Check restart count and errors
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='pm2 info bob-aggregator'

# PM2 will stop restarting after 10 failed attempts within 10 seconds
# Check the error logs
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='pm2 logs bob-aggregator --err --lines 50'

# Reset restart counter and try again
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='pm2 reset bob-aggregator'
```

### Can't Connect from Internet

```bash
# Check firewall rules
gcloud compute firewall-rules list | grep aggregator

# Check if service is listening
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='sudo netstat -tlnp | grep 8080'

# Test from inside VM
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='curl localhost:8080/health'
```

### Out of Disk Space

```bash
# Check disk usage
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='df -h'

# Clean old backups
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='sudo rm -rf /opt/bob-aggregator.backup.*'

# Clean npm cache
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='npm cache clean --force'
```

### High Memory Usage

```bash
# E2-micro has only 1GB RAM
# PM2 automatically restarts at 512MB (configured in ecosystem.config.js)

# 1. Check memory usage
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='pm2 info bob-aggregator | grep memory'

# 2. Check restart history (frequent restarts indicate memory issue)
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='pm2 info bob-aggregator | grep restart'

# 3. If constantly restarting due to memory, lower the limit
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='
cd /opt/bob-aggregator
nano ecosystem.config.js  # Change max_memory_restart to "400M"
pm2 restart bob-aggregator
'

# 4. Or upgrade to e2-small (2GB RAM, ~$13/month)
```

---

## Cost Optimization

### Free Tier Eligibility

E2-micro instances are free tier eligible:
- 1 instance per month
- 30GB egress per month (Americas/Europe)
- 5GB egress per month (other regions)

### Staying Within Free Tier

1. **Use only 1 E2-micro instance**
2. **Monitor egress** (mostly heartbeats and API responses)
3. **Use internal IP** for communication between GCP services
4. **Clean up old logs** periodically

### Beyond Free Tier

If you exceed free tier:
- E2-micro: ~$7.50/month
- E2-small (2GB RAM): ~$13/month
- Egress: ~$0.12/GB after free tier

---

## Security Considerations

### Firewall

Current setup allows **public access** to port 8080. For production:

```bash
# Restrict to specific IPs
gcloud compute firewall-rules update allow-http-aggregator \
    --source-ranges=YOUR_IP/32,PROVIDER_IP/32
```

### Service Account

The `gcp.json` file contains credentials. Never commit to git:

```bash
# Verify it's in .gitignore
grep gcp.json .gitignore
```

### HTTPS/TLS

For production, use a reverse proxy with SSL:

```bash
# Install nginx
sudo apt-get install -y nginx certbot python3-certbot-nginx

# Configure nginx as reverse proxy
sudo nano /etc/nginx/sites-available/aggregator

# Get Let's Encrypt certificate
sudo certbot --nginx -d aggregator.yourdomain.com
```

### Database Backups

```bash
# Manual backup
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='
    sudo tar -czf /tmp/aggregator-backup-$(date +%Y%m%d).tar.gz /opt/bob-aggregator/data/
    # Download backup
    # gcloud compute scp bob-aggregator:/tmp/aggregator-backup-*.tar.gz ./
'
```

---

## Maintenance

### Regular Tasks

**Weekly:**
- Check PM2 status and restart count
- Review logs for errors
- Monitor disk usage

**Monthly:**
- Update dependencies (`npm update`)
- Clean old backups and logs
- Review firewall rules
- Check for Node.js security updates
- Clear PM2 logs if growing large

### Automated Maintenance Script

```bash
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='
    echo "=== Aggregator Health Check ==="
    pm2 info bob-aggregator | grep -E "status|uptime|restarts|memory"
    curl -s localhost:8080/health | jq .
    echo ""
    echo "=== Resource Usage ==="
    df -h / | tail -1
    free -h | grep Mem
    echo ""
    echo "=== Recent PM2 Restarts ==="
    pm2 info bob-aggregator | grep "restart time"
    echo ""
    echo "=== Error Logs (Last 5) ==="
    pm2 logs bob-aggregator --err --lines 5 --nostream
    echo ""
    echo "=== Log File Sizes ==="
    du -h /opt/bob-aggregator/logs/*.log
'
```

### Clean Up Logs

```bash
# PM2 logs can grow large over time
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='
    # Clear all PM2 logs
    pm2 flush

    # Or manually delete old logs
    rm -f /opt/bob-aggregator/logs/*.log
    pm2 restart bob-aggregator
'
```

---

## Rollback

If an update breaks something:

```bash
# SSH to instance
gcloud compute ssh bob-aggregator --zone=us-central1-a

# Find backup
ls -lt /opt/ | grep bob-aggregator.backup

# Restore backup
pm2 stop bob-aggregator
mv /opt/bob-aggregator /opt/bob-aggregator.broken
cp -r /opt/bob-aggregator.backup.YYYYMMDD-HHMMSS /opt/bob-aggregator
cd /opt/bob-aggregator
pm2 restart bob-aggregator

# Verify
pm2 info bob-aggregator
curl localhost:8080/health
```

---

## Complete Teardown

To completely remove the deployment:

```bash
# Delete VM instance
gcloud compute instances delete bob-aggregator --zone=us-central1-a --quiet

# Delete firewall rule
gcloud compute firewall-rules delete allow-http-aggregator --quiet

# Verify cleanup
gcloud compute instances list | grep bob-aggregator
gcloud compute firewall-rules list | grep aggregator
```

---

## PM2 Quick Reference

### Essential Commands

```bash
# Start
pm2 start ecosystem.config.js

# Restart (zero-downtime)
pm2 restart bob-aggregator

# Stop
pm2 stop bob-aggregator

# Remove from PM2
pm2 delete bob-aggregator

# View status
pm2 list

# Detailed info
pm2 info bob-aggregator

# Live logs
pm2 logs bob-aggregator

# Monitoring dashboard
pm2 monit

# Save process list (for boot startup)
pm2 save

# Reset restart counter
pm2 reset bob-aggregator
```

### PM2 Startup on Boot

Already configured by `deploy.sh`, but if needed:

```bash
# Generate startup script
pm2 startup systemd

# Run the command it outputs (with sudo)

# Save current processes
pm2 save
```

---

## Summary

**Deploy**: `./deploy.sh`
**Update**: `./update.sh`
**Logs**: `gcloud compute ssh bob-aggregator --zone=us-central1-a --command='pm2 logs bob-aggregator'`
**Status**: `gcloud compute ssh bob-aggregator --zone=us-central1-a --command='pm2 list'`
**Monitor**: `gcloud compute ssh bob-aggregator --zone=us-central1-a --command='pm2 monit'`
**Health**: `curl http://EXTERNAL_IP:8080/health`

**PM2 Benefits**:
- ✅ Auto-restarts on crash
- ✅ Starts on boot
- ✅ Zero-downtime updates
- ✅ Built-in monitoring
- ✅ Memory management (auto-restart at 512MB)

For issues, check PM2 logs first. Most problems are configuration-related or excessive restarts.
