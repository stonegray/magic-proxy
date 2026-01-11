# Magic Proxy Test Environment

## Overview

This directory contains a **Docker-in-Docker (DinD) simulator** that allows you to safely test potentially destructive Docker operations without affecting your host system or production environment.

The simulator is an isolated Docker environment that runs inside a container, complete with its own Docker daemon. You can run the entire magic-proxy application stack (magic-proxy + traefik) inside this isolated environment.

## Why This Exists

Docker operations like removing containers, pruning images, or dynamically managing the container ecosystem can be risky to test in development. This simulator provides a safe sandbox where you can:

- Test Docker API operations in isolation
- Verify container management workflows
- Experiment with potentially destructive operations
- Debug issues without affecting other services
- Run integration tests with real Docker operations

## Architecture

```
Your Host
├── docker (host Docker daemon)
└── simulator container (DinD)
    ├── docker daemon (inner)
    ├── magic-proxy container
    └── traefik container
```

## Quick Start

### One-Command Setup

```bash
cd test-env
./up.sh
```

This will:
1. Build the magic-proxy image from the project root
2. Export it as a gzip tarball
3. Start the simulator with docker-compose
4. Load the pre-built image into the inner Docker daemon
5. Start magic-proxy and traefik containers inside the simulator

### Access the Environment

```bash
# Open a shell inside the simulator
./shell.sh

# View logs from magic-proxy
./logs.sh -f

# Test the API
./test.sh

# Stop everything
./down.sh
```

## Files and Scripts

### Core Files

- **`docker-compose.yml`** - Defines the outer simulator container (DinD)
- **`filesystem/test-env.yml`** - Docker Compose file that runs INSIDE the simulator
- **`filesystem/magic-proxy.tar.gz`** - Pre-built magic-proxy Docker image (created by `prepare-simulator.sh`)

### Helper Scripts

| Script | Purpose |
|--------|---------|
| `prepare-simulator.sh` | Builds the magic-proxy image and exports it as gzip |
| `up.sh` | One-command startup: prepare image + start simulator |
| `down.sh` | Stop and remove the simulator container |
| `shell.sh` | Open a bash/sh shell inside the simulator |
| `logs.sh` | View logs from the inner magic-proxy container |
| `test.sh` | Test connectivity to the magic-proxy API |

## Running Services Inside the Simulator

### Magic Proxy

- **Container Name**: `workspace-magic-proxy-1`
- **Port**: 3000
- **Role**: Docker management API
- **Environment**:
  - `PROXY_TYPE`: traefik
  - `PROXY_OUTPUT_FILE`: traefik

### Traefik

- **Container Name**: `traefik`
- **Port**: 80 (mapped to host 8080 inside simulator)
- **Role**: Reverse proxy and load balancer

## Common Workflows

### Monitor the Application

```bash
# Follow logs in real-time
./logs.sh -f

# Check container status
./shell.sh
# Inside: docker ps
```

### Test the API

```bash
# Automated test
./test.sh

# Manual curl from inside simulator
./shell.sh
# Inside: curl -v http://workspace-magic-proxy-1:3000/
```

### Execute Commands Inside

```bash
./shell.sh
# Inside: 
# - docker ps          (list containers)
# - docker logs <name> (view logs)
# - docker exec <name> sh (enter container)
# - curl localhost:3000   (test the API)
```

### Clean Up

```bash
# Stop everything and remove containers
./down.sh

# Remove the pre-built image archive (to rebuild)
rm filesystem/magic-proxy.tar.gz
```

## Rebuilding the Image

The `prepare-simulator.sh` script:
1. Builds the magic-proxy Docker image from `../Dockerfile`
2. Exports it as `filesystem/magic-proxy.tar.gz`
3. Shows the file size

Run this after making code changes to magic-proxy:

```bash
./prepare-simulator.sh
# Then reload inside the simulator:
./shell.sh
# Inside: docker compose -f /workspace/test-env.yml restart
```

Or use the all-in-one command:

```bash
./up.sh  # Rebuilds image and restarts everything
```

## Troubleshooting

### Container Keeps Restarting

Check the logs:
```bash
./logs.sh
```

Common issues:
- Missing config file at `/var/config/magic-proxy.yml` - This is expected (non-fatal initialization error)
- Port 3000 already in use - Try `./down.sh` first

### Can't Connect to the API

Verify containers are running:
```bash
./shell.sh
# Inside: docker ps
```

Test from inside the simulator:
```bash
./test.sh
```

### Simulator Won't Start

Ensure:
- Docker is running on your host
- No port conflicts (8080 for traefik inside simulator)
- Sufficient disk space for the image (411MB)

### Start Fresh

```bash
./down.sh
rm filesystem/magic-proxy.tar.gz
./up.sh
```

## Architecture Notes

### Why Docker-in-Docker?

- **Isolation**: Operations inside don't affect the host or other containers
- **Realism**: The inner environment is a real Docker daemon with real container lifecycle
- **Safety**: Destructive operations are contained within the simulator
- **Testing**: Integration tests can use real Docker operations

### Image Caching

The pre-built image is cached as `filesystem/magic-proxy.tar.gz` to speed up subsequent starts. This file:
- Is created by `prepare-simulator.sh`
- Is mounted into the simulator at `/images/magic-proxy.tar.gz`
- Is automatically loaded into the inner Docker daemon on startup

### Network

- The simulator container runs with `privileged: true` to allow full Docker-in-Docker functionality
- The inner environment creates its own Docker network (`workspace_default`)
- Containers inside communicate via container names (DNS resolution)

## Environment Variables

### Magic Proxy Container

- `PROXY_TYPE=traefik` - Use traefik backend
- `PROXY_OUTPUT_FILE=traefik` - Configuration file output name

Configure these in `filesystem/test-env.yml` under the `magic-proxy` service.

## Advanced Usage

### Direct Docker Commands Inside Simulator

```bash
docker exec simulator docker ps
docker exec simulator docker logs workspace-magic-proxy-1
docker exec simulator docker exec workspace-magic-proxy-1 sh
```

### Inspect the Simulator Environment

```bash
# List all files/mounts
docker exec simulator ls -la /workspace
docker exec simulator ls -la /images

# Check Docker version inside
docker exec simulator docker version
```

### Restart Services Without Rebuilding

```bash
docker exec simulator docker compose -f /workspace/test-env.yml restart
```

## Cleanup on Host

After development, free up space:

```bash
cd test-env
./down.sh

# Optional: Remove the image archive to force rebuild next time
rm filesystem/magic-proxy.tar.gz
```

The simulator image itself (docker:27-dind) will remain in your Docker daemon unless you explicitly prune it.

## See Also

- `../Dockerfile` - The magic-proxy application Docker image definition
- `../package.json` - Build configuration and dependencies
- `./filesystem/test-env.yml` - Inner compose configuration
