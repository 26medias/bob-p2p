#!/bin/bash

# Demo: Aggregator Management Workflow
# This script demonstrates how to manage multiple aggregators

echo "========================================="
echo "Bob P2P - Aggregator Management Demo"
echo "========================================="
echo ""

cd /home/julien/Projects/bob-p2p/bob-p2p-client

# Step 1: List current aggregators
echo "Step 1: List current aggregators"
echo "---------------------------------"
npm run aggregator list -- --config config.json
echo ""
read -p "Press Enter to continue..."
echo ""

# Step 2: Test connectivity
echo "Step 2: Test aggregator connectivity"
echo "-------------------------------------"
npm run aggregator test -- --config config.json
echo ""
read -p "Press Enter to continue..."
echo ""

# Step 3: Show help
echo "Step 3: Available commands"
echo "--------------------------"
npm run aggregator -- --config config.json
echo ""
read -p "Press Enter to continue..."
echo ""

# Step 4: Demonstrate how consumer uses aggregators
echo "Step 4: Consumer searches across all aggregators"
echo "------------------------------------------------"
echo "When you search for APIs, the consumer queries ALL configured aggregators"
echo "and merges the results:"
echo ""
echo "  npm run search -- --config config.json --category ml"
echo ""
echo "This would search:"
for agg in $(grep -A 5 '"aggregators"' config.json | grep 'http' | tr -d ' ",'); do
    echo "  - $agg"
done
echo ""
read -p "Press Enter to continue..."
echo ""

# Step 5: Demonstrate provider behavior
echo "Step 5: Provider registers with all aggregators"
echo "-----------------------------------------------"
echo "When you start a provider, it registers with ALL configured aggregators:"
echo ""
echo "  npm run provide -- --config config.json --apis api.json"
echo ""
echo "This registers your APIs on all aggregators for maximum discoverability."
echo ""
echo "========================================="
echo "Demo Complete!"
echo "========================================="
echo ""
echo "Key Points:"
echo "  ✓ Multiple aggregators = redundancy + broader API discovery"
echo "  ✓ Config-based management (edit config.json or use CLI)"
echo "  ✓ System works even if some aggregators are offline"
echo "  ✓ Changes require restart to take effect"
echo ""
echo "See AGGREGATOR_MANAGEMENT.md for complete guide"
