#!/usr/bin/env bash
set -euo pipefail

# deploy.sh - build Docker image locally and load it onto remote host over ssh
# Usage: LAVENDER_HOST=lavender LAVENDER_USER=user IMAGE_NAME=repo/name TAG=tag ./deploy.sh

: ${LAVENDER_HOST:=lavender}
: ${LAVENDER_USER:=}

# default image name from package.json name field
IMAGE_NAME=${IMAGE_NAME:-$(node -e "console.log(require('./package.json').name || 'docker-image')")}
# default tag: git short sha if available, fallback to timestamp
if [ -z "${TAG:-}" ]; then
  if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    TAG=$(git rev-parse --short HEAD)
  else
    TAG=$(date +%Y%m%d%H%M%S)
  fi
fi

REMOTE_TARGET="${LAVENDER_HOST}"
if [ -n "${LAVENDER_USER}" ]; then
  REMOTE_TARGET="${LAVENDER_USER}@${LAVENDER_HOST}"
fi

# Optional SSH config: LAVENDER_PORT, SSH_OPTIONS, RETRIES
: ${LAVENDER_PORT:=}
: ${SSH_OPTIONS:="-o BatchMode=yes"}
: ${RETRIES:=3}

SSH_CMD_BASE=(ssh)
if [ -n "${LAVENDER_PORT}" ]; then
  SSH_CMD_BASE+=( -p "${LAVENDER_PORT}" )
fi
# append user-provided options
SSH_CMD_BASE+=( ${SSH_OPTIONS} )

IMAGE_REF="${IMAGE_NAME}:${TAG}"

echo "Building Docker image ${IMAGE_REF}..."
docker build -t "${IMAGE_REF}" .

echo "Checking connectivity to ${REMOTE_TARGET}..."
# Test SSH connectivity before streaming
connected=0
for i in $(seq 1 ${RETRIES}); do
  if "${SSH_CMD_BASE[@]}" "${REMOTE_TARGET}" -- "echo ok" >/dev/null 2>&1; then
    connected=1
    break
  fi
  echo "SSH connectivity check failed (attempt ${i}/${RETRIES}), retrying..." >&2
  sleep 1
done

if [ "$connected" -ne 1 ]; then
  echo "ERROR: Unable to reach ${REMOTE_TARGET} over SSH. Please verify network and SSH access." >&2
  exit 2
fi

echo "Saving and streaming image to ${REMOTE_TARGET}..."
# Use gzip to reduce transfer size and stream into docker on remote
if docker save "${IMAGE_REF}" | gzip -c | "${SSH_CMD_BASE[@]}" "${REMOTE_TARGET}" -- 'gunzip | docker load'; then
  echo "Image ${IMAGE_REF} successfully loaded on ${REMOTE_TARGET}";
else
  echo "ERROR: Failed to transfer/load image on ${REMOTE_TARGET}" >&2;
  exit 1;
fi

# Optionally, you can run a command on the remote to tag or restart services, e.g.:
# ssh "${REMOTE_TARGET}" "docker image ls | grep ${IMAGE_NAME}"

exit 0
