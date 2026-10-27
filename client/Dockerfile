# ==========================================
# Stage 1: Build the Vite React Application
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Accept build-time API base URL for Vite static bundling
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

# Copy dependency manifests first for optimal Docker layer caching
COPY package.json package-lock.json ./

# Install clean dependencies using locked versions
RUN npm ci

# Copy frontend source code and configuration files
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src

# Build production bundle to /app/dist
RUN npm run build

# ==========================================
# Stage 2: Serve with lightweight Nginx
# ==========================================
FROM nginx:1.27-alpine AS runner

# Copy custom Nginx configuration for SPA routing fallback and asset caching
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled static assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose HTTP port
EXPOSE 80

# Start Nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]
