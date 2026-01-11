#!/bin/bash
#
# test.sh
# Test connectivity to the magic-proxy API running inside the simulator.
# Uses docker run with curl to test from within the simulator's network.
#

set -e

echo "Testing magic-proxy API running inside the simulator..."
echo ""

# Try to reach the magic-proxy container
docker exec simulator docker run --rm --network workspace_default alpine:latest wget -q -O- http://workspace-magic-proxy-1:3000/ 2>/dev/null > /dev/null

if [ $? -eq 0 ]; then
  echo "✓ Successfully connected to magic-proxy on port 3000!"
  echo ""
  echo "Fetching API response:"
  docker exec simulator docker run --rm --network workspace_default alpine:latest wget -q -O- http://workspace-magic-proxy-1:3000/ 2>/dev/null || true
else
  echo "✗ Failed to connect to magic-proxy"
  echo ""
  echo "Checking container status..."
  docker exec simulator docker ps --filter name=magic-proxy
  echo ""
  echo "Recent logs:"
  docker exec simulator docker logs --tail 20 workspace-magic-proxy-1
  exit 1
fi
