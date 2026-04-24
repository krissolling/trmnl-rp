FROM node:20-alpine

WORKDIR /app

# No runtime deps — the api uses only native Node (fetch, node:http, node:fs).
COPY package.json ./
COPY lib ./lib
COPY scripts ./scripts
COPY public ./public
COPY server.js ./

# Cache directory — mount a named volume here via Coolify's persistent storage
# so it survives redeploys. Without a volume the cache just rebuilds on restart
# (one-off slow first poll, then fast).
RUN mkdir -p /app/data

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "server.js"]
