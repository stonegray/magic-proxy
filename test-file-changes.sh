#!/bin/bash
# Test script to verify repeated compose file changes trigger updates

set -e

echo "=== Testing Repeated Compose File Changes ==="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

TEST_FILE="/tmp/test-compose-changes.yml"

# Create a test compose file
cat > "$TEST_FILE" << 'EOF'
version: "3.9"
services:
  test-app:
    image: nginx
    x-magic-proxy:
      template: oidc.yml
      hostname: test.example.com
      target: http://10.0.0.1:8080
EOF

echo -e "${BLUE}Initial file content:${NC}"
grep "target:" "$TEST_FILE"
echo ""

# Change 1
echo -e "${GREEN}Change 1: Updating target to 10.0.0.2${NC}"
sed -i 's/10.0.0.1/10.0.0.2/g' "$TEST_FILE"
grep "target:" "$TEST_FILE"
sleep 1
echo ""

# Change 2
echo -e "${GREEN}Change 2: Updating target to 10.0.0.3${NC}"
sed -i 's/10.0.0.2/10.0.0.3/g' "$TEST_FILE"
grep "target:" "$TEST_FILE"
sleep 1
echo ""

# Change 3
echo -e "${GREEN}Change 3: Updating target to 10.0.0.4${NC}"
sed -i 's/10.0.0.3/10.0.0.4/g' "$TEST_FILE"
grep "target:" "$TEST_FILE"
sleep 1
echo ""

# Change back
echo -e "${GREEN}Change 4: Changing back to 10.0.0.1${NC}"
sed -i 's/10.0.0.4/10.0.0.1/g' "$TEST_FILE"
grep "target:" "$TEST_FILE"
echo ""

echo -e "${BLUE}Test complete! Each change should have been detected.${NC}"
echo "Check the application logs to verify all 4 changes triggered updates."
echo ""
echo "Expected behavior:"
echo "  - Changes 1, 2, 3, 4 should all trigger 'Compose file changed' logs"
echo "  - Changes 1, 2, 3, 4 should all trigger backend updates (target changed)"
echo "  - The hostDb should show the updated target each time"
echo ""
echo "If you see updates for change 1 but not 2-4, there may be an issue."

rm "$TEST_FILE"
