# Build stage
FROM node:latest AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY . .
RUN npm run build

# Run stage
FROM node:latest
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/dist ./dist
RUN npm ci || npm install --omit=dev

# We access Docker socket at runtime (mounted via docker-compose)
ENV DOCKER_SOCKET=/var/run/docker.sock
EXPOSE 3000
CMD ["node", "dist/index.js"]
