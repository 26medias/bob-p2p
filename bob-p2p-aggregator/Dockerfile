# Node.js 22 base image
FROM node:22-slim

# Install build dependencies for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm install --production

# Copy application code
COPY src/ ./src/
COPY config.example.json ./

# Copy config.json (will be created by deploy script)
COPY config.json ./

# Create data directory for SQLite
RUN mkdir -p /app/data

# Expose port 8080 (Cloud Run HTTP server)
EXPOSE 8080

# Expose P2P ports (4001 for libp2p TCP, 4002 for WebSocket)
EXPOSE 4001
EXPOSE 4002

# Start the application
CMD ["node", "src/index.js", "--config", "config.json"]
