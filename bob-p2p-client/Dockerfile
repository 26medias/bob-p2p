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

# Copy API handlers (including demo handlers)
COPY handlers/ ./handlers/
COPY api-demo/ ./api-demo/

# Copy config files
COPY config.example.json ./
COPY api.example.json ./

# Copy actual config and API files (will be provided at build time)
COPY config.json ./
COPY api.json ./

# Create data directory for SQLite
RUN mkdir -p /app/data
RUN mkdir -p /tmp/bob-results

# Expose port 8080 (Cloud Run requires this)
EXPOSE 8080

# Start the provider
CMD ["node", "src/cli/provider.js", "--config", "config.json", "--apis", "api.json"]
