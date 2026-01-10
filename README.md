<img src=".github/img/splash.jpeg">

magic-proxy automatically configures your proxy by reading `x-magic-proxy-descriptor` fields embedded in docker compose files, allowing you to simply bring the compose up and trust that your proxy will automatically configure itself without user intervention. 

magic-proxy passively streams events from your `docker.sock` to ensure near-instant configuration of your proxy, without any polling overhead.

magic-proxy is proxy-agnostic and user extensible. It contains a built in HTTP server for status reporting; which is read only and isolated in a v8 VM with a well defined abstraction layer to reduce attack surface.

magic-proxy is currently in development. 

Example: 

```yaml
version: "3.9"

services:
  web-test1:
    image: crccheck/hello-world
    container_name: web-test1
    expose:
      - "8000"
    x-magic-proxy-descriptor:
      template: example.yml
      hostname: web-test1.proxy.example.org
```

Now visiting web-test1.proxy.example.org transparently forwards to 

## Usage:
Simply start the container on your host and specify the name of the proxy container.  
```yaml
version: '3.8'
services:
  magic-proxy:
    build: .
    image: docker-ts-app:latest
    enviroment:
      - PROXY_TYPE="traefik"
      - PROXY_OUTPUT_FILE="traefik"
    volumes:
      - "traefik_magic.yml:/var/traefik_magic.yml"
      - "/var/run/docker.sock:/var/run/docker.sock"
      - "/:/host:ro" # required to read the compose files
    restart: unless-stopped
  traefik:
    image: "traefik:v3.4"
    container_name: "traefik"
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
    command:
      - "--entryPoints.web.address=:80"
    ports:
      - "80:80"
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock:ro"

```