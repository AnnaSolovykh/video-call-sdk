# Multi-stage build for production optimization
FROM node:18-alpine AS base

# Install security updates and dumb-init for proper signal handling
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init curl && \
    rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S videocall && \
    adduser -S videocall -u 1001 -G videocall

WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Production dependencies stage
FROM base AS production
ENV NODE_ENV=production
# Install tsx for TypeScript execution
RUN npm ci --omit=dev && npm install -g tsx && npm cache clean --force

# Copy application code - fix path to match project structure
COPY src/server/ ./src/server/

# Change ownership to non-root user
RUN chown -R videocall:videocall /app
USER videocall

# Expose WebSocket port
EXPOSE 3001

# Add labels for better container management
LABEL maintainer="video-call-sdk" \
      version="1.0" \
      description="Signaling server for Video Call SDK"

# Health check with better error handling
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e " \
        const ws = require('ws'); \
        const client = new ws('ws://localhost:3001'); \
        const timeout = setTimeout(() => { \
            client.terminate(); \
            process.exit(1); \
        }, 8000); \
        client.on('open', () => { \
            clearTimeout(timeout); \
            client.close(); \
            process.exit(0); \
        }); \
        client.on('error', () => { \
            clearTimeout(timeout); \
            process.exit(1); \
        });"

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["tsx", "src/server/signalling-server.ts"]

# Development stage for local development
FROM base AS development
ENV NODE_ENV=development
RUN npm ci
COPY . .
USER videocall
CMD ["tsx", "src/server/signalling-server.ts"]