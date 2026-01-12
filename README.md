# `magic-proxy`

[![CI/CD](https://github.com/stonegray/magic-proxy/actions/workflows/ci.yml/badge.svg)](https://github.com/stonegray/magic-proxy/actions/workflows/ci.yml)

magic-proxy automatically configures your web proxy by reading `x-magic-proxy` fields embedded in docker compose files, allowing you to simply bring the compose up and trust that your proxy will automatically configure itself without user intervention. It is essentially a templating engine that uses a common syntax, allowing it to generate output for various proxies.

magic-proxy attaches event-based watchers to relavant files and passively streams events from your `docker.sock` to ensure near-instant configuration of your proxy when it changes, without any polling overhead.

Features:

- API for status monitoring
- Hundreds of built-in regression tests to ensure future stability
- Runtime tests to validate your configuration

Limitations:
- Only one port per container.
- Currently only the Traefik backend is implemented. You may try the Nginx branch at your own risk.

Example: 

```yaml
services:
  web-test1:
    image: crccheck/hello-world
    container_name: web-test1
    expose:
      - "8000"
    x-magic-proxy:
      # read ./config/template/* to see how these work, but basically it's
      # the base config that gets permutated for each container:
      template: example.yml
      # base information to pass to the proxy:
      hostname: web-test1.proxy.example.org
      target: http://web-test1:8000
      userData:
        # add anything here; like OIDC/Oauth2 roles/groups
        # this data can get passed to any configuration parameter
        # on the proxy:
        oidc_group: superCoolPeople
        rateLimit: 10
```

Now visiting web-test1.proxy.example.org transparently forwards to port 8000 in the container.

## Usage:
Simply start the container on your host and specify the name of the proxy container.  
```yaml
version: '3.8'
services:
  magic-proxy:
    build: .
    image: docker-ts-app:latest
    volumes:
      - "./config:/var/config:ro"
      - "/var/run/docker.sock:/var/run/docker.sock:ro" 
      - "generated_config:/var/generated"
      - "/:/host:ro" # required to read the compose files
  traefik:
    image: "traefik:v3.4"
    container_name: "traefik"
    command:
      - "--configFile:/var/generated/traefik_magic.yml"

    ports:
      - "80:80"
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock:ro"
      - "generated_config:/var/generated:ro"
```

## Why?

