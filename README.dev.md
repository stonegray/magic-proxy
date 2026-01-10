Development notes

- To use the app against a remote or non-default docker socket, set DOCKER_SOCKET env var.
- If you prefer not to mount the socket, consider using Docker Engine API over TCP with TLS and point DOCKER_HOST accordingly.
