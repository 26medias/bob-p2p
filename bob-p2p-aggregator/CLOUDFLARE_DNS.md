# Cloudflare DNS Setup for Aggregator

## TL;DR

**Yes!** You can point your Cloudflare subdomain to the VM's IP address. It's actually simpler than static site hosting.

---

## How It Works

When you deploy to GCP, your VM gets a **static external IP** that you can point your DNS to.

```
aggregator.yourdomain.com  →  Cloudflare DNS (A record)  →  34.x.x.x (VM IP)  →  Your Aggregator
```

---

## Step-by-Step Setup

### 1. Get Your VM's External IP

After deploying, the script shows:
```
External IP: 34.x.x.x
```

Or get it anytime:
```bash
gcloud compute instances describe bob-aggregator \
    --zone=us-central1-a \
    --format='get(networkInterfaces[0].accessConfigs[0].natIP)'
```

**Important**: By default, GCP assigns a **ephemeral** (changing) IP. You should reserve a **static IP** for production.

### 2. Reserve a Static IP (Recommended)

```bash
# Reserve a static IP
gcloud compute addresses create bob-aggregator-ip \
    --region=us-central1

# Get the reserved IP
gcloud compute addresses describe bob-aggregator-ip \
    --region=us-central1 \
    --format='get(address)'

# Assign to your VM
gcloud compute instances delete-access-config bob-aggregator \
    --zone=us-central1-a \
    --access-config-name="External NAT"

gcloud compute instances add-access-config bob-aggregator \
    --zone=us-central1-a \
    --access-config-name="External NAT" \
    --address=STATIC_IP_ADDRESS
```

**Cost**: Static IPs are free while in use, $0.01/hour if unused (~$7/month).

### 3. Add DNS Record in Cloudflare

1. **Log in to Cloudflare Dashboard**
2. **Select your domain**
3. **Go to DNS → Records**
4. **Add A Record**:
   - **Type**: A
   - **Name**: aggregator (or your desired subdomain)
   - **IPv4 address**: 34.x.x.x (your VM's IP)
   - **Proxy status**: DNS only (gray cloud) - **Important!**
   - **TTL**: Auto

5. **Click Save**

### 4. Verify DNS Propagation

```bash
# Check DNS resolution
dig aggregator.yourdomain.com

# Or
nslookup aggregator.yourdomain.com

# Should return your VM's IP
```

### 5. Test Your Aggregator

```bash
curl http://aggregator.yourdomain.com:8080/health
curl http://aggregator.yourdomain.com:8080/info
```

---

## Cloudflare Proxy: Orange vs Gray Cloud

### Gray Cloud (DNS Only) - Recommended for Now

**Pros:**
- Direct connection to your VM
- No SSL certificate needed initially
- Lower latency
- Works with any port (8080)

**Cons:**
- No Cloudflare DDoS protection
- No caching
- No WAF
- Your VM IP is exposed

### Orange Cloud (Proxied) - For Production

**Requirements:**
- Must use port 80 (HTTP) or 443 (HTTPS)
- Need SSL certificate on your VM
- Or use Cloudflare's Flexible SSL (not recommended for APIs with sensitive data)

**Pros:**
- DDoS protection
- CDN caching
- WAF
- Hides your VM IP

**Setup:**
1. Get SSL certificate (Let's Encrypt)
2. Configure nginx as reverse proxy
3. Change aggregator to listen on localhost:8080
4. Nginx forwards 443 → 8080
5. Enable orange cloud in Cloudflare

---

## Production Setup with HTTPS

### Option 1: Cloudflare + Let's Encrypt (Recommended)

```bash
# SSH to VM
gcloud compute ssh bob-aggregator --zone=us-central1-a

# Install nginx and certbot
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx

# Configure nginx
sudo nano /etc/nginx/sites-available/aggregator
```

**Nginx config** (`/etc/nginx/sites-available/aggregator`):
```nginx
server {
    listen 80;
    server_name aggregator.yourdomain.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/aggregator /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Get SSL certificate
sudo certbot --nginx -d aggregator.yourdomain.com

# Certbot will:
# 1. Verify domain ownership
# 2. Get certificate from Let's Encrypt
# 3. Configure nginx for HTTPS
# 4. Set up auto-renewal
```

Now your aggregator is available at:
- `https://aggregator.yourdomain.com` (no port needed!)

### Option 2: Cloudflare Tunnel (Zero-Trust)

Even simpler - no open ports needed!

```bash
# Install cloudflared
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# Authenticate
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create bob-aggregator

# Configure tunnel
cat > ~/.cloudflared/config.yml <<EOF
tunnel: YOUR_TUNNEL_ID
credentials-file: /home/$USER/.cloudflared/YOUR_TUNNEL_ID.json

ingress:
  - hostname: aggregator.yourdomain.com
    service: http://localhost:8080
  - service: http_status:404
EOF

# Route DNS
cloudflared tunnel route dns bob-aggregator aggregator.yourdomain.com

# Run tunnel
cloudflared tunnel run bob-aggregator

# Install as service
sudo cloudflared service install
sudo systemctl start cloudflared
```

**Benefits:**
- No open ports
- Free SSL
- DDoS protection
- No need for nginx

---

## Comparison: Static Bucket vs VM

| Aspect | Static Bucket (GCS/S3) | VM with Aggregator |
|--------|------------------------|---------------------|
| **DNS Setup** | CNAME to bucket URL | A record to VM IP |
| **Complexity** | Simpler | Need reverse proxy for HTTPS |
| **SSL** | Automatic (with Cloudflare) | Need Let's Encrypt or Cloudflare |
| **Port** | Standard (80/443) | Custom (8080) or nginx proxy |
| **Cost** | ~$0.01/GB | ~$0-7/month (VM) |
| **Dynamic** | Static files only | Full API server |

**Key Difference**: Static buckets only serve files. VM serves a running Node.js application, so you have full control.

---

## Firewall Configuration

### Allow HTTP/HTTPS

If using nginx with SSL:

```bash
# Allow port 80 and 443
gcloud compute firewall-rules create allow-http-https-aggregator \
    --direction=INGRESS \
    --priority=1000 \
    --network=default \
    --action=ALLOW \
    --rules=tcp:80,tcp:443 \
    --source-ranges=0.0.0.0/0 \
    --target-tags=http-server,https-server
```

### Restrict Direct Access to Port 8080

Once nginx is handling traffic:

```bash
# Update firewall to only allow 8080 from localhost
gcloud compute firewall-rules update allow-http-aggregator \
    --source-ranges=127.0.0.1/32

# Or delete it entirely
gcloud compute firewall-rules delete allow-http-aggregator
```

---

## DNS Records You'll Need

### Minimal Setup (HTTP only)
```
Type: A
Name: aggregator
Value: 34.x.x.x
Proxy: DNS only (gray cloud)
```

### Production Setup (HTTPS)
```
Type: A
Name: aggregator
Value: 34.x.x.x
Proxy: Proxied (orange cloud)
```

Plus optional:
```
Type: A
Name: www.aggregator
Value: 34.x.x.x
Proxy: Proxied
```

---

## Testing Your Setup

### 1. DNS Resolution
```bash
dig aggregator.yourdomain.com +short
# Should show your VM IP
```

### 2. HTTP Access
```bash
# Direct IP
curl http://34.x.x.x:8080/health

# Via subdomain
curl http://aggregator.yourdomain.com:8080/health
```

### 3. HTTPS Access (after nginx setup)
```bash
curl https://aggregator.yourdomain.com/health
```

### 4. Provider Registration
Update your providers to use:
```json
{
    "aggregators": [
        "https://aggregator.yourdomain.com"
    ]
}
```

---

## Troubleshooting

### DNS not resolving
```bash
# Wait 5 minutes for propagation
# Clear DNS cache
sudo systemd-resolve --flush-caches

# Check from different location
https://dnschecker.org
```

### Connection refused
```bash
# Check if aggregator is running
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='pm2 list'

# Check firewall
gcloud compute firewall-rules list | grep aggregator

# Test from inside VM
gcloud compute ssh bob-aggregator --zone=us-central1-a --command='curl localhost:8080/health'
```

### SSL certificate failed
```bash
# Ensure DNS is pointing to your VM
dig aggregator.yourdomain.com

# Check nginx config
sudo nginx -t

# Check certbot logs
sudo certbot certificates
```

---

## Quick Start Checklist

For production deployment:

- [ ] Deploy VM with `./deploy.sh`
- [ ] Reserve static IP and assign to VM
- [ ] Add A record in Cloudflare (gray cloud)
- [ ] Test: `curl http://aggregator.yourdomain.com:8080/health`
- [ ] Install nginx and Let's Encrypt
- [ ] Get SSL certificate
- [ ] Enable Cloudflare proxy (orange cloud)
- [ ] Test: `curl https://aggregator.yourdomain.com/health`
- [ ] Update providers to use new URL

---

## Summary

**Simple Setup (5 minutes):**
1. Deploy VM → Get IP
2. Add A record in Cloudflare → Point to IP
3. Done! Use `http://aggregator.yourdomain.com:8080`

**Production Setup (15 minutes):**
1. Simple setup above
2. Install nginx + Let's Encrypt
3. Get SSL certificate
4. Enable Cloudflare proxy
5. Done! Use `https://aggregator.yourdomain.com`

It's actually **easier** than static bucket hosting because you don't need to configure bucket-specific settings. Just a simple A record pointing to your VM's IP!
