# Stage 1: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Install only the necessary build dependencies
RUN apk add --no-cache python3 build-base

# Layer optimization: Copy and install dependencies first
COPY package.json yarn.lock ./
# More efficient dependency installation
RUN yarn install --frozen-lockfile --network-timeout 600000 --network-concurrency 1 --production=false

# Copy Prisma schema and generate clients
COPY prisma ./prisma
RUN yarn prisma:generate

# Copy only necessary source files for building
COPY tsconfig*.json ./
COPY src ./src

# Build the application
RUN yarn build

# Stage 2: Production Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./
COPY prisma ./prisma

# Install only production dependencies with minimal size
RUN apk add --no-cache python3 build-base && \
    yarn install --frozen-lockfile --network-timeout 600000 --network-concurrency 1 --production --ignore-optional && \
    yarn cache clean && \
    apk del python3 build-base

# Stage 3: Runner (minimal image)
FROM node:20-alpine AS runner
WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Create a non-root user with least privileges
RUN addgroup -S nodejs && \
    adduser -S nestjs -G nodejs && \
    chown -R nestjs:nodejs /app

# Copy only what's needed to run the application
COPY --from=deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=nestjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/generated ./generated

# Copy only necessary config files
COPY --chown=nestjs:nodejs package.json ./

# Switch to non-root user
USER nestjs

# Expose the application port
EXPOSE 4000

# Set health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

# Start the application with optimized memory settings
CMD ["node", "--max_old_space_size=2048", "dist/main"]