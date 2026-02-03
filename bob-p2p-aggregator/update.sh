#!/bin/bash

#############################################
# Bob P2P Aggregator - Quick Update Script
#############################################

set -e

# Colors
GREEN='\033[0;32m'
NC='\033[0m'

# Configuration
SERVICE_ACCOUNT_FILE="./gcp.json"
INSTANCE_NAME="bob-aggregator"
ZONE="us-central1-a"
PROJECT_ID=$(jq -r '.project_id' "$SERVICE_ACCOUNT_FILE")

echo "========================================="
echo "Updating Bob P2P Aggregator"
echo "========================================="
echo ""

# Authenticate
gcloud auth activate-service-account --key-file="$SERVICE_ACCOUNT_FILE" --quiet
gcloud config set project "$PROJECT_ID" --quiet

# Prepare package
echo "Preparing update package..."
DEPLOY_DIR="/tmp/bob-aggregator-update"
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"

rsync -av --exclude='node_modules' \
    --exclude='.git' \
    --exclude='*.log' \
    --exclude='gcp.json' \
    --exclude='deploy.sh' \
    --exclude='update.sh' \
    --exclude='config.json' \
    ./ "$DEPLOY_DIR/"

echo -e "${GREEN}✓ Package prepared${NC}"
echo ""

# Upload
echo "Uploading files..."
gcloud compute scp --recurse "$DEPLOY_DIR"/* \
    "$INSTANCE_NAME:/tmp/bob-aggregator-update" \
    --zone="$ZONE" \
    --project="$PROJECT_ID"

echo -e "${GREEN}✓ Files uploaded${NC}"
echo ""

# Update and restart
echo "Updating on server..."
gcloud compute ssh "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT_ID" --command='
set -e

echo "Backing up current version..."
cp -r /opt/bob-aggregator /opt/bob-aggregator.backup.$(date +%Y%m%d-%H%M%S)

echo "Stopping PM2 process..."
pm2 stop bob-aggregator || true

echo "Updating files..."
cp -r /tmp/bob-aggregator-update/* /opt/bob-aggregator/
rm -rf /tmp/bob-aggregator-update

echo "Installing/updating dependencies..."
cd /opt/bob-aggregator
npm install --production

echo "Restarting with PM2 (zero-downtime)..."
pm2 restart bob-aggregator || pm2 start ecosystem.config.js
pm2 save

echo "Checking status..."
sleep 2
pm2 list
pm2 info bob-aggregator
'

echo ""
echo -e "${GREEN}✓ Update complete!${NC}"
echo ""

# Get IP and test
EXTERNAL_IP=$(gcloud compute instances describe "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT_ID" --format='get(networkInterfaces[0].accessConfigs[0].natIP)')

echo "Testing aggregator..."
sleep 3
if curl -f -s "http://$EXTERNAL_IP:8080/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Aggregator is responding!${NC}"
else
    echo "⚠ Aggregator not responding yet (check logs)"
fi

echo ""
echo "View logs: gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --project=$PROJECT_ID --command='pm2 logs bob-aggregator'""
echo "Check status: gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --project=$PROJECT_ID --command='pm2 list'"
