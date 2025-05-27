# Use Node.js LTS version
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (only ws is needed for server)
RUN npm install ws

# Copy server code
COPY server/ ./server/

# Expose WebSocket port
EXPOSE 3001

# Start signaling server
CMD ["node", "server/signaling-server.js"]

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const ws = require('ws'); const client = new ws('ws://localhost:3001'); client.on('open', () => { client.close(); process.exit(0); }); client.on('error', () => process.exit(1));"