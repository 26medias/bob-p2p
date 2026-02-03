#!/bin/bash

#############################################
# Bob P2P Aggregator - GCP E2-micro Deployment
#############################################

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SERVICE_ACCOUNT_FILE="./gcp.json"
INSTANCE_NAME="bob-aggregator"
ZONE="us-central1-a"
MACHINE_TYPE="e2-micro"
IMAGE_FAMILY="ubuntu-2204-lts"
IMAGE_PROJECT="ubuntu-os-cloud"
BOOT_DISK_SIZE="10GB"
PROJECT_ID=""

echo "========================================="
echo "Bob P2P Aggregator Deployment to GCP"
echo "========================================="
echo ""

# Step 1: Validate service account file
echo "Step 1: Validating service account..."
if [ ! -f "$SERVICE_ACCOUNT_FILE" ]; then
    echo -e "${RED}✗ Service account file not found: $SERVICE_ACCOUNT_FILE${NC}"
    echo "Please ensure gcp.json exists in the current directory"
    exit 1
fi

# Extract project ID from service account
PROJECT_ID=$(jq -r '.project_id' "$SERVICE_ACCOUNT_FILE")
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" == "null" ]; then
    echo -e "${RED}✗ Could not extract project_id from service account${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Service account found${NC}"
echo "  Project ID: $PROJECT_ID"
echo ""

# Step 2: Authenticate with service account
echo "Step 2: Authenticating with GCP..."
gcloud auth activate-service-account --key-file="$SERVICE_ACCOUNT_FILE"
gcloud config set project "$PROJECT_ID"
echo -e "${GREEN}✓ Authenticated${NC}"
echo ""

# Step 3: Check if instance exists
echo "Step 3: Checking if VM instance exists..."
if gcloud compute instances describe "$INSTANCE_NAME" --zone="$ZONE" &> /dev/null; then
    echo -e "${YELLOW}⚠ Instance $INSTANCE_NAME already exists${NC}"
    read -p "Do you want to DELETE and recreate it? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Deleting existing instance..."
        gcloud compute instances delete "$INSTANCE_NAME" --zone="$ZONE" --quiet
        echo -e "${GREEN}✓ Instance deleted${NC}"
    else
        echo "Using existing instance..."
    fi
else
    echo -e "${GREEN}✓ No existing instance found${NC}"
fi
echo ""

# Step 4: Create VM instance if needed
if ! gcloud compute instances describe "$INSTANCE_NAME" --zone="$ZONE" &> /dev/null; then
    echo "Step 4: Creating E2-micro VM instance..."
    gcloud compute instances create "$INSTANCE_NAME" \
        --project="$PROJECT_ID" \
        --zone="$ZONE" \
        --machine-type="$MACHINE_TYPE" \
        --image-family="$IMAGE_FAMILY" \
        --image-project="$IMAGE_PROJECT" \
        --boot-disk-size="$BOOT_DISK_SIZE" \
        --boot-disk-type=pd-standard \
        --tags=http-server,https-server,p2p-relay

    echo -e "${GREEN}✓ VM instance created${NC}"
    echo "Waiting 60 seconds for instance to fully initialize..."
    sleep 60
else
    echo "Step 4: VM instance already exists"
fi
echo ""

# Step 5: Create firewall rules for HTTP and P2P
echo "Step 5: Creating firewall rules..."

# HTTP firewall rule
if ! gcloud compute firewall-rules describe allow-http-aggregator &> /dev/null; then
    gcloud compute firewall-rules create allow-http-aggregator \
        --project="$PROJECT_ID" \
        --direction=INGRESS \
        --priority=1000 \
        --network=default \
        --action=ALLOW \
        --rules=tcp:8080 \
        --source-ranges=0.0.0.0/0 \
        --target-tags=http-server
    echo -e "${GREEN}✓ HTTP firewall rule created${NC}"
else
    echo -e "${GREEN}✓ HTTP firewall rule already exists${NC}"
fi

# P2P TCP firewall rule (port 4001)
if ! gcloud compute firewall-rules describe allow-p2p-tcp-aggregator &> /dev/null; then
    gcloud compute firewall-rules create allow-p2p-tcp-aggregator \
        --project="$PROJECT_ID" \
        --direction=INGRESS \
        --priority=1000 \
        --network=default \
        --action=ALLOW \
        --rules=tcp:4001 \
        --source-ranges=0.0.0.0/0 \
        --target-tags=p2p-relay
    echo -e "${GREEN}✓ P2P TCP firewall rule created${NC}"
else
    echo -e "${GREEN}✓ P2P TCP firewall rule already exists${NC}"
fi

# P2P WebSocket firewall rule (port 4002)
if ! gcloud compute firewall-rules describe allow-p2p-ws-aggregator &> /dev/null; then
    gcloud compute firewall-rules create allow-p2p-ws-aggregator \
        --project="$PROJECT_ID" \
        --direction=INGRESS \
        --priority=1000 \
        --network=default \
        --action=ALLOW \
        --rules=tcp:4002 \
        --source-ranges=0.0.0.0/0 \
        --target-tags=p2p-relay
    echo -e "${GREEN}✓ P2P WebSocket firewall rule created${NC}"
else
    echo -e "${GREEN}✓ P2P WebSocket firewall rule already exists${NC}"
fi

echo ""

# Step 6: Prepare deployment package
echo "Step 6: Preparing deployment package..."
DEPLOY_DIR="/tmp/bob-aggregator-deploy"
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"

# Copy necessary files (exclude node_modules, we'll install on server)
rsync -av --exclude='node_modules' \
    --exclude='.git' \
    --exclude='*.log' \
    --exclude='gcp.json' \
    --exclude='deploy.sh' \
    ./ "$DEPLOY_DIR/"

# Copy config if exists
if [ -f "config.json" ]; then
    cp config.json "$DEPLOY_DIR/"
    echo -e "${GREEN}✓ Config file included${NC}"
else
    echo -e "${YELLOW}⚠ No config.json found - you'll need to create it on the server${NC}"
fi

echo -e "${GREEN}✓ Deployment package prepared${NC}"
echo ""

# Step 7: Upload files to VM
echo "Step 7: Uploading files to VM..."
echo "This may take a minute..."

gcloud compute scp --recurse "$DEPLOY_DIR"/* \
    "$INSTANCE_NAME:/tmp/bob-aggregator" \
    --zone="$ZONE" \
    --project="$PROJECT_ID"

echo -e "${GREEN}✓ Files uploaded${NC}"
echo ""

# Step 8: Install and configure on VM
echo "Step 8: Installing Node.js, PM2, and dependencies on VM..."

gcloud compute ssh "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT_ID" --command='
set -e

echo "Waiting for apt locks to be released..."
WAIT_COUNT=0
while [ $WAIT_COUNT -lt 60 ]; do
    if ! sudo fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 && \
       ! sudo fuser /var/lib/apt/lists/lock >/dev/null 2>&1 && \
       ! sudo fuser /var/lib/dpkg/lock >/dev/null 2>&1; then
        echo "Apt locks released!"
        break
    fi
    echo "Waiting for apt locks (attempt $((WAIT_COUNT+1))/60)..."
    sleep 5
    WAIT_COUNT=$((WAIT_COUNT+1))
done

if [ $WAIT_COUNT -ge 60 ]; then
    echo "Warning: Timed out waiting for apt locks, proceeding anyway..."
fi

echo "System ready!"
sleep 2

echo "Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    echo "Docker installed!"
else
    echo "Docker already installed"
fi

echo "Docker version: $(sudo docker --version)"

echo "Creating application directory..."
sudo mkdir -p /opt/bob-aggregator
sudo chown $USER:$USER /opt/bob-aggregator

echo "Moving files to /opt/bob-aggregator..."
cp -r /tmp/bob-aggregator/* /opt/bob-aggregator/
rm -rf /tmp/bob-aggregator

echo "Installation complete!"
'

echo -e "${GREEN}✓ Node.js, PM2, and dependencies installed${NC}"
echo ""

# Step 9: Build Docker image and create startup script
echo "Step 9: Building Docker image and configuring auto-start..."

gcloud compute ssh "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT_ID" --command='
cd /opt/bob-aggregator

# Build Docker image
echo "Building Docker image..."
sudo docker build -t bob-aggregator:latest .

# Get external IP for P2P bootstrap addresses
EXTERNAL_IP=$(curl -s -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip)
echo "External IP: $EXTERNAL_IP"

# Create systemd service for Docker container
echo "Creating systemd service..."
sudo tee /etc/systemd/system/bob-aggregator.service > /dev/null <<EOF
[Unit]
Description=Bob P2P Aggregator
Requires=docker.service
After=docker.service

[Service]
Type=simple
Restart=always
RestartSec=5s
ExecStartPre=-/usr/bin/docker stop bob-aggregator
ExecStartPre=-/usr/bin/docker rm bob-aggregator
ExecStart=/usr/bin/docker run --rm --name bob-aggregator \\
  --network=host \\
  -e EXTERNAL_IP=${EXTERNAL_IP} \\
  -v /opt/bob-aggregator/data:/app/data \\
  bob-aggregator:latest
ExecStop=/usr/bin/docker stop bob-aggregator

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable bob-aggregator

echo "Docker image built and systemd service configured!"
'

echo -e "${GREEN}✓ Docker image built and service configured for auto-start${NC}"
echo ""

# Step 10: Check/create config
echo "Step 10: Checking configuration..."

CONFIG_EXISTS=$(gcloud compute ssh "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT_ID" --command='
if [ -f /opt/bob-aggregator/config.json ]; then
    echo "yes"
else
    echo "no"
fi
')

if [ "$CONFIG_EXISTS" == "no" ]; then
    echo -e "${YELLOW}⚠ No config.json found on server${NC}"
    echo ""
    echo "You need to create config.json on the server before starting the service."
    echo "Run these commands:"
    echo ""
    echo "  gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --project=$PROJECT_ID"
    echo "  cd /opt/bob-aggregator"
    echo "  nano config.json"
    echo ""
    echo "Then start with: sudo systemctl start bob-aggregator"
    echo ""
    read -p "Press Enter to continue (service will not start without config)..."
else
    echo -e "${GREEN}✓ Config file exists${NC}"

    # Step 11: Start service with systemd
    echo ""
    echo "Step 11: Starting aggregator service..."

    gcloud compute ssh "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT_ID" --command='
    # Restart service
    sudo systemctl restart bob-aggregator

    # Wait for service to start
    sleep 5

    # Show status
    sudo systemctl status bob-aggregator --no-pager -l
    '

    echo -e "${GREEN}✓ Service started${NC}"
fi
echo ""

# Step 12: Get instance info
echo "========================================="
echo "Deployment Complete!"
echo "========================================="
echo ""

EXTERNAL_IP=$(gcloud compute instances describe "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT_ID" --format='get(networkInterfaces[0].accessConfigs[0].natIP)')
INTERNAL_IP=$(gcloud compute instances describe "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT_ID" --format='get(networkInterfaces[0].networkIP)')

echo "Instance Information:"
echo "  Name: $INSTANCE_NAME"
echo "  Zone: $ZONE"
echo "  Machine Type: $MACHINE_TYPE"
echo "  External IP: $EXTERNAL_IP"
echo "  Internal IP: $INTERNAL_IP"
echo ""
echo "Aggregator URLs:"
echo "  Health: http://$EXTERNAL_IP:8080/health"
echo "  Info: http://$EXTERNAL_IP:8080/info"
echo "  Search: http://$EXTERNAL_IP:8080/api/search"
echo "  P2P Bootstrap: http://$EXTERNAL_IP:8080/p2p/bootstrap"
echo ""
echo "P2P Relay Ports:"
echo "  TCP: $EXTERNAL_IP:4001"
echo "  WebSocket: $EXTERNAL_IP:4002"
echo ""
echo "Useful Commands:"
echo "  SSH to instance:"
echo "    gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --project=$PROJECT_ID"
echo ""
echo "  View logs (live):"
echo "    gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --project=$PROJECT_ID --command='sudo journalctl -u bob-aggregator -f'"
echo ""
echo "  View logs (last 100 lines):"
echo "    gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --project=$PROJECT_ID --command='sudo journalctl -u bob-aggregator -n 100'"
echo ""
echo "  Restart service:"
echo "    gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --project=$PROJECT_ID --command='sudo systemctl restart bob-aggregator'"
echo ""
echo "  Check status:"
echo "    gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --project=$PROJECT_ID --command='sudo systemctl status bob-aggregator'"
echo ""
echo "  Stop service:"
echo "    gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --project=$PROJECT_ID --command='sudo systemctl stop bob-aggregator'"
echo ""
echo "  View Docker containers:"
echo "    gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --project=$PROJECT_ID --command='sudo docker ps'"
echo ""
echo "  Update code:"
echo "    Run this script again (it will rebuild image and restart)"
echo ""

# Test health endpoint
echo "Testing aggregator..."
sleep 3
if curl -f -s "http://$EXTERNAL_IP:8080/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Aggregator is responding!${NC}"
    curl -s "http://$EXTERNAL_IP:8080/health" | jq .
    echo ""

    # Get P2P bootstrap addresses
    echo "P2P Bootstrap Addresses (use these in client configs):"
    curl -s "http://$EXTERNAL_IP:8080/p2p/bootstrap" | jq -r '.bootstrap[]' || echo "  Not available yet - check logs"
else
    echo -e "${YELLOW}⚠ Could not reach aggregator (might need a few seconds to start)${NC}"
    echo "  Try: curl http://$EXTERNAL_IP:8080/health"
fi
echo ""

echo "========================================="
echo "Next Steps:"
echo "========================================="
if [ "$CONFIG_EXISTS" == "no" ]; then
    echo "1. SSH to instance and create config.json"
    echo "2. Start the service: sudo systemctl start bob-aggregator"
    echo "3. Check status: sudo systemctl status bob-aggregator"
fi
echo "4. Get P2P bootstrap addresses:"
echo "   curl http://$EXTERNAL_IP:8080/p2p/bootstrap"
echo ""
echo "5. Update client configs with bootstrap addresses:"
echo "   - bob-p2p-client/config.json"
echo "   - bob-p2p-client/config-user.json"
echo ""
echo "6. Test search: curl http://$EXTERNAL_IP:8080/api/search"
echo ""
echo "Happy aggregating! 🚀"
