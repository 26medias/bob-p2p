#!/bin/bash

#############################################
# Bob P2P Aggregator - Cloud Run Deployment
# Much faster than VM deployment!
#############################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SERVICE_ACCOUNT_FILE="./gcp.json"
SERVICE_NAME="bob-aggregator"
REGION="us-central1"
PROJECT_ID=""
IMAGE_NAME=""

echo "========================================="
echo "Bob P2P Aggregator - Cloud Run Deploy"
echo "========================================="
echo ""

# Step 1: Validate service account
echo "Step 1: Validating service account..."
if [ ! -f "$SERVICE_ACCOUNT_FILE" ]; then
    echo -e "${RED}✗ Service account file not found: $SERVICE_ACCOUNT_FILE${NC}"
    exit 1
fi

PROJECT_ID=$(jq -r '.project_id' "$SERVICE_ACCOUNT_FILE")
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" == "null" ]; then
    echo -e "${RED}✗ Could not extract project_id from service account${NC}"
    exit 1
fi

IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"

echo -e "${GREEN}✓ Service account found${NC}"
echo "  Project ID: $PROJECT_ID"
echo "  Image: $IMAGE_NAME"
echo ""

# Step 2: Check for config.json
echo "Step 2: Checking for config.json..."
if [ ! -f "config.json" ]; then
    echo -e "${YELLOW}⚠ No config.json found${NC}"
    echo ""
    echo "You need config.json for the aggregator to work."
    echo "Options:"
    echo "  1. Create config.json now (recommended)"
    echo "  2. Deploy without it and add via Secret Manager later"
    echo ""
    read -p "Create config.json now? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Creating config.json from example..."
        cp config.example.json config.json
        echo ""
        echo "Please edit config.json with your settings:"
        echo "  - wallet.address"
        echo "  - wallet.privateKey"
        echo ""
        read -p "Press Enter after editing config.json..."
    else
        echo -e "${YELLOW}⚠ Deploying without config - service will not start${NC}"
    fi
else
    echo -e "${GREEN}✓ config.json found${NC}"
fi
echo ""

# Step 3: Authenticate
echo "Step 3: Authenticating with GCP..."
gcloud auth activate-service-account --key-file="$SERVICE_ACCOUNT_FILE" --quiet
gcloud config set project "$PROJECT_ID" --quiet
echo -e "${GREEN}✓ Authenticated${NC}"
echo ""

# Step 4: Enable required APIs
echo "Step 4: Enabling required APIs..."
echo "This may take a minute on first run..."
gcloud services enable cloudbuild.googleapis.com --quiet
gcloud services enable run.googleapis.com --quiet
gcloud services enable containerregistry.googleapis.com --quiet
echo -e "${GREEN}✓ APIs enabled${NC}"
echo ""

# Step 5: Build container
echo "Step 5: Building Docker container..."
echo "Building: $IMAGE_NAME"

# Create .dockerignore if it doesn't exist
cat > .dockerignore <<EOF
node_modules
.git
*.log
gcp.json
deploy.sh
deploy-cloud-run.sh
update.sh
*.md
.dockerignore
Dockerfile
EOF

# Build and push using Cloud Build (faster than local build + push)
gcloud builds submit --tag "$IMAGE_NAME" --project="$PROJECT_ID" --quiet

echo -e "${GREEN}✓ Container built and pushed${NC}"
echo ""

# Step 6: Deploy to Cloud Run
echo "Step 6: Deploying to Cloud Run..."

# Check if service already exists
if gcloud run services describe "$SERVICE_NAME" --region="$REGION" --project="$PROJECT_ID" &> /dev/null; then
    echo -e "${BLUE}Service already exists, updating...${NC}"
    ACTION="update"
else
    echo -e "${BLUE}Creating new service...${NC}"
    ACTION="create"
fi

# Deploy to Cloud Run
gcloud run deploy "$SERVICE_NAME" \
    --image="$IMAGE_NAME" \
    --platform=managed \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --allow-unauthenticated \
    --memory=512Mi \
    --cpu=1 \
    --timeout=300 \
    --min-instances=0 \
    --max-instances=10 \
    --port=8080 \
    --set-env-vars="NODE_ENV=production" \
    --quiet

echo -e "${GREEN}✓ Deployed to Cloud Run${NC}"
echo ""

# Step 7: Get service URL
echo "========================================="
echo "Deployment Complete!"
echo "========================================="
echo ""

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --format='value(status.url)')

echo "Service Information:"
echo "  Name: $SERVICE_NAME"
echo "  Region: $REGION"
echo "  URL: $SERVICE_URL"
echo ""
echo "Aggregator Endpoints:"
echo "  Health: $SERVICE_URL/health"
echo "  Info: $SERVICE_URL/info"
echo "  Search: $SERVICE_URL/api/search"
echo "  P2P Bootstrap: $SERVICE_URL/p2p/bootstrap"
echo ""

echo "Note: Cloud Run supports HTTP/HTTPS only. P2P relay may have limited functionality."
echo "For full P2P support, consider deploying on a VM with open TCP ports."
echo ""

# Test health endpoint
echo "Testing aggregator..."
sleep 5
if curl -f -s "$SERVICE_URL/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Aggregator is responding!${NC}"
    curl -s "$SERVICE_URL/health" | jq . 2>/dev/null || curl -s "$SERVICE_URL/health"
else
    echo -e "${YELLOW}⚠ Aggregator not responding yet${NC}"
    echo ""
    echo "Check logs with:"
    echo "  gcloud run services logs read $SERVICE_NAME --region=$REGION --project=$PROJECT_ID"
    echo ""
    if [ ! -f "config.json" ]; then
        echo -e "${YELLOW}Note: You deployed without config.json - the service won't start${NC}"
        echo "To add config:"
        echo "  1. Create config.json locally"
        echo "  2. Re-run this script"
    fi
fi
echo ""

echo "Useful Commands:"
echo ""
echo "  View logs (live):"
echo "    gcloud run services logs tail $SERVICE_NAME --region=$REGION --project=$PROJECT_ID"
echo ""
echo "  View recent logs:"
echo "    gcloud run services logs read $SERVICE_NAME --region=$REGION --project=$PROJECT_ID --limit=100"
echo ""
echo "  Update service (after code changes):"
echo "    ./deploy-cloud-run.sh"
echo ""
echo "  Delete service:"
echo "    gcloud run services delete $SERVICE_NAME --region=$REGION --project=$PROJECT_ID"
echo ""
echo "  Scale to zero (pause):"
echo "    gcloud run services update $SERVICE_NAME --region=$REGION --project=$PROJECT_ID --min-instances=0"
echo ""
echo "  Keep always warm (costs more):"
echo "    gcloud run services update $SERVICE_NAME --region=$REGION --project=$PROJECT_ID --min-instances=1"
echo ""

echo "========================================="
echo "Cloud Run Benefits:"
echo "========================================="
echo "✓ Deploys in ~2 minutes (vs 10+ for VM)"
echo "✓ Auto-scales from 0 to millions of requests"
echo "✓ Only pay for actual usage (scales to zero)"
echo "✓ Automatic HTTPS with custom domains"
echo "✓ Built-in load balancing"
echo "✓ No server management needed"
echo ""
echo "Cost Estimate:"
echo "  Free tier: 2M requests/month, 360K vCPU-seconds, 180K GiB-seconds"
echo "  After free tier: ~\$0.00002400/request + \$0.00001800/vCPU-second"
echo "  Typical: \$1-5/month for low traffic"
echo ""

echo "Next Steps:"
echo "1. Update providers to register with: $SERVICE_URL"
echo "2. Test search: curl $SERVICE_URL/api/search"
echo ""
echo "Happy aggregating! 🚀"
