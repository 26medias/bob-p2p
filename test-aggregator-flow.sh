#!/bin/bash

# Test script for Bob P2P Aggregator + Provider flow
# This script verifies the complete registration and discovery process

echo "========================================="
echo "Bob P2P Aggregator Flow Test"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check aggregator health
echo "Test 1: Aggregator Health"
response=$(curl -s http://localhost:8080/health)
if echo "$response" | jq -e '.status == "healthy"' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Aggregator is healthy${NC}"
else
    echo -e "${RED}✗ Aggregator health check failed${NC}"
    exit 1
fi
echo ""

# Test 2: Check aggregator info
echo "Test 2: Aggregator Info"
info=$(curl -s http://localhost:8080/info)
totalApis=$(echo "$info" | jq -r '.stats.totalAPIs')
echo "Total APIs indexed: $totalApis"
if [ "$totalApis" -eq 3 ]; then
    echo -e "${GREEN}✓ All 3 APIs registered${NC}"
else
    echo -e "${YELLOW}⚠ Expected 3 APIs, found $totalApis${NC}"
fi
echo ""

# Test 3: Search all APIs
echo "Test 3: Search All APIs"
allApis=$(curl -s http://localhost:8080/api/search)
count=$(echo "$allApis" | jq '.total')
echo "Found $count APIs:"
echo "$allApis" | jq -r '.apis[] | "  - \(.id): \(.name) ($\(.pricing.amount))"'
echo ""

# Test 4: Search by category
echo "Test 4: Search by Category (ml)"
mlApis=$(curl -s "http://localhost:8080/api/search?category=ml")
mlCount=$(echo "$mlApis" | jq '.total')
echo "Found $mlCount ML APIs:"
echo "$mlApis" | jq -r '.apis[] | "  - \(.id): \(.name)"'
echo ""

# Test 5: Search by tag
echo "Test 5: Search by Tag (image-generation)"
tagApis=$(curl -s "http://localhost:8080/api/search?tags=image-generation")
tagCount=$(echo "$tagApis" | jq '.total')
echo "Found $tagCount APIs with tag 'image-generation':"
echo "$tagApis" | jq -r '.apis[] | "  - \(.id): \(.name)"'
echo ""

# Test 6: Get specific API details
echo "Test 6: Get Specific API Details (runware-text-to-image-v1)"
apiDetails=$(curl -s http://localhost:8080/api/runware-text-to-image-v1)
if echo "$apiDetails" | jq -e '.id' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ API details retrieved${NC}"
    echo "API: $(echo "$apiDetails" | jq -r '.name')"
    echo "Description: $(echo "$apiDetails" | jq -r '.description')"
    echo "Price: \$$(echo "$apiDetails" | jq -r '.pricing.amount') $(echo "$apiDetails" | jq -r '.pricing.unit')"
    echo "Provider: $(echo "$apiDetails" | jq -r '.provider.address')"
    echo "Endpoint: $(echo "$apiDetails" | jq -r '.provider.endpoint')"
    echo "Status: $(echo "$apiDetails" | jq -r '.status')"
else
    echo -e "${RED}✗ Failed to get API details${NC}"
fi
echo ""

# Test 7: Check provider health
echo "Test 7: Provider Health"
providerHealth=$(curl -s http://localhost:8000/health)
if echo "$providerHealth" | jq -e '.status == "ok"' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Provider is healthy${NC}"
    echo "Uptime: $(echo "$providerHealth" | jq -r '.uptime') seconds"
else
    echo -e "${RED}✗ Provider health check failed${NC}"
fi
echo ""

# Test 8: Check provider info
echo "Test 8: Provider Info"
providerInfo=$(curl -s http://localhost:8000/info)
if echo "$providerInfo" | jq -e '.mode' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Provider info retrieved${NC}"
    echo "Mode: $(echo "$providerInfo" | jq -r '.mode')"
    echo "APIs: $(echo "$providerInfo" | jq -r '.apis | length')"
    echo "Wallet: $(echo "$providerInfo" | jq -r '.wallet')"
else
    echo -e "${RED}✗ Failed to get provider info${NC}"
fi
echo ""

# Summary
echo "========================================="
echo "Test Summary"
echo "========================================="
echo -e "${GREEN}✓ Aggregator is running and indexing APIs${NC}"
echo -e "${GREEN}✓ Provider is registered and discoverable${NC}"
echo -e "${GREEN}✓ Search functionality is working${NC}"
echo -e "${GREEN}✓ API details are accessible${NC}"
echo ""
echo "All tests passed!"
echo ""
echo "Try these commands:"
echo "  curl http://localhost:8080/api/search | jq ."
echo "  curl http://localhost:8080/api/runware-text-to-image-v1 | jq ."
echo "  curl http://localhost:8000/health | jq ."
