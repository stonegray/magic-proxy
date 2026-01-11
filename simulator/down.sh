#!/bin/bash
#
# down.sh
# Stop and remove the simulator container and network.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Stopping Test Environment ==="
cd "$SCRIPT_DIR"

docker compose down --remove-orphans

echo "=== Test Environment Stopped ==="
