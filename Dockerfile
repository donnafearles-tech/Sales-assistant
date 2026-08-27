# Builder stage
FROM node:20-slim AS builder
WORKDIR /app

# Copy package files and install all deps (including dev for build)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Final runtime stage (smaller)
FROM node:20-slim AS runner
WORKDIR /app

# Copy only package metadata and install production deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built artifacts
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
EXPOSE 8080

# Start the compiled server (matches package.json start)
CMD ["node", "dist/server.cjs"]
