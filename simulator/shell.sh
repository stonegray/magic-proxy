#!/bin/bash
#
# shell.sh
# Opens a bash shell inside the simulator container.
# Creates and starts the simulator if it doesn't already exist.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if simulator container exists
if ! docker ps -a --format '{{.Names}}' | grep -q '^simulator$'; then
  echo "Simulator container not found, starting it..."
  cd "$SCRIPT_DIR"
  docker compose up -d
  
  # Wait for container to be healthy
  echo "Waiting for simulator to be ready..."
  until docker exec simulator docker info > /dev/null 2>&1; do
    sleep 1
  done
  echo "Simulator is ready!"
elif ! docker ps --format '{{.Names}}' | grep -q '^simulator$'; then
  echo "Simulator exists but is not running, starting it..."
  cd "$SCRIPT_DIR"
  docker compose up -d
fi

# Spawn shell in the simulator
exec docker exec -it simulator sh
