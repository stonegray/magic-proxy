#!/bin/bash
#
# logs.sh
# View logs from the magic-proxy container running inside the simulator.
# Optionally follow logs if --follow or -f is passed.
#

FOLLOW=""
if [[ "$1" == "--follow" || "$1" == "-f" ]]; then
  FOLLOW="-f"
fi

docker exec simulator docker logs $FOLLOW workspace-magic-proxy-1
