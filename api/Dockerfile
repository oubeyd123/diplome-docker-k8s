# Start from a small Linux image that already has Node.js 20
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app

# Install the dependencies first (Docker caches this step while package.json doesn't change)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the application code
COPY src ./src

# Don't run as root
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health >/dev/null || exit 1
CMD ["node", "src/server.js"]
