FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies, skipping prepare script
RUN npm ci --ignore-scripts

# Copy source and build
COPY tsconfig.json ./
COPY src ./src

# Install TypeScript and build
RUN npm install typescript --save-dev && npm run build

# Remove dev dependencies
RUN npm prune --omit=dev

# Expose port
ENV PORT=8080
EXPOSE 8080

# Run server
CMD ["node", "dist/server.js"]
