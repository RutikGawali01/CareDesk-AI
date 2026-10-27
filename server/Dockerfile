# ==========================================
# CareDesk-AI Backend Service Dockerfile
# ==========================================
FROM node:22-slim

# Set working directory inside container
WORKDIR /app

# Set default production environment variables
ENV NODE_ENV=production
ENV PORT=5001

# Copy package manifests and Prisma schema first for layer caching
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma

# Install production dependencies only and generate Prisma client
RUN npm ci --omit=dev

# Copy application source code
COPY src ./src

# Set ownership to unprivileged built-in node user
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Expose backend application port
EXPOSE 5001

# Health check using built-in Node.js HTTP client against /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:' + (process.env.PORT || 5001) + '/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Production startup command
CMD ["node", "src/server.js"]
