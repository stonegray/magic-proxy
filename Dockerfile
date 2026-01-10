# ---------- Build stage ----------
FROM node:24.12.0 AS build
WORKDIR /app

# Install dependencies (lockfile enforced)
COPY package.json package-lock.json ./
RUN npm ci

# Copy only source needed to build
COPY . .

# Build application
RUN npm run build


# ---------- Runtime stage ----------
FROM node:24.12.0
WORKDIR /app

# Copy package metadata + lockfile
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json

# Copy resolved dependencies exactly as built
COPY --from=build /app/node_modules ./node_modules

# Copy built output
COPY --from=build /app/dist ./dist

# Remove dev dependencies without re-resolving versions
RUN npm prune --omit=dev

# Runtime config
ENV NODE_ENV=production
ENV DOCKER_SOCKET=/var/run/docker.sock

EXPOSE 3000
CMD ["node", "dist/index.js"]