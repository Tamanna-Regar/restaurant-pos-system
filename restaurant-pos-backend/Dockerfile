# Backend Dockerfile for Tamanna Restaurant POS
FROM node:20-alpine AS production

WORKDIR /app

# Install build dependencies if needed
RUN apk add --no-cache python3 make g++

# Copy package descriptors
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Ensure upload directory exists
RUN mkdir -p uploads logs

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

# Container Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

CMD ["npm", "start"]

