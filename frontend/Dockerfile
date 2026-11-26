# Start from nginx (the web server that serves the site and forwards /api to the API)
FROM nginxinc/nginx-unprivileged:1.27-alpine

# Switch to root to install Node.js, which is needed to build the React app
USER root
RUN apk add --no-cache nodejs npm
WORKDIR /app

# Install the dependencies first (Docker caches this step while package.json doesn't change)
COPY package*.json ./
RUN npm ci

# Copy the code and build the site into static files (dist/), then hand them to nginx
COPY . .
RUN npm run build && cp -r dist/. /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Back to the non-root nginx user (uid 101) that this image normally uses
USER 101
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
