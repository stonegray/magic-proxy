#!/bin/bash
#
# up.sh
# Prepare the simulator environment and start it.
# This builds the magic-proxy image, exports it, and starts the docker-compose.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Starting Test Environment ==="
echo ""

# First, prepare the image
echo "Step 1: Building and exporting magic-proxy image..."
"$SCRIPT_DIR/prepare-simulator.sh"

echo ""
echo "Step 2: Starting simulator..."
cd "$SCRIPT_DIR"
docker compose up -d

echo ""
echo "=== Test Environment Started ==="
echo ""
echo "Available commands:"
echo "  ./shell.sh   - Open a shell inside the simulator"
echo "  ./logs.sh    - View logs from magic-proxy inside the simulator"
echo "  ./test.sh    - Test connectivity to the magic-proxy API"
echo "  ./down.sh    - Stop and remove the simulator"
