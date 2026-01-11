#!/bin/bash
#
# prepare-simulator.sh
# Builds the magic-proxy Docker image and exports it as a gzip tarball
# for use in the docker-in-docker simulator environment.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/filesystem"
OUTPUT_FILE="$OUTPUT_DIR/magic-proxy.tar.gz"

echo "=== Magic Proxy Simulator Preparation ==="
echo "Project root: $PROJECT_ROOT"
echo "Output file:  $OUTPUT_FILE"
echo ""

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Build the Docker image for current platform
echo "Building magic-proxy Docker image..."
cd "$PROJECT_ROOT"
docker buildx build --platform linux/amd64,linux/arm64 -t magic-proxy:latest --load .

# Export the image as a gzip tarball
echo ""
echo "Exporting image to $OUTPUT_FILE..."
docker save magic-proxy:latest | gzip > "$OUTPUT_FILE"

# Show the result
SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
echo ""
echo "=== Done ==="
echo "Image exported: $OUTPUT_FILE ($SIZE)"
echo ""
echo "You can now start the simulator with:"
echo "  cd $SCRIPT_DIR && docker compose up"
