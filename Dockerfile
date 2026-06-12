# Stage 1: Builder
FROM node:20-slim AS builder
WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

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
FROM node:20-slim AS deps
WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./
COPY prisma ./prisma

# Install only production dependencies with minimal size
RUN apt-get update && apt-get install -y python3 make g++ && \
    yarn install --frozen-lockfile --network-timeout 600000 --network-concurrency 1 --production --ignore-optional && \
    yarn cache clean && \
    apt-get purge -y python3 make g++ && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# Stage 3: Runner (minimal image)
FROM node:20-slim AS runner
WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Install runtime libraries required for canvas rendering (pdfjs-dist dependency)
RUN apt-get update && apt-get install -y \
    libcairo2 \
    libpango1.0-0 \
    libpangocairo1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    libpng16-16 \
    libwebp7 \
    librsvg2-2 \
    libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user with least privileges
RUN groupadd -r nodejs && \
    useradd -r -g nodejs nestjs && \
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