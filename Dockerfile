# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- Runtime stage ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY views ./views
COPY public ./public
# data/ (SQLite) and uploads/ (PDFs) live on the persistent volume
RUN mkdir -p data uploads && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
