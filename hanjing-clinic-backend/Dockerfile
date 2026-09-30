ARG NODE_IMAGE=docker.1ms.run/library/node:20-bookworm-slim
FROM ${NODE_IMAGE}

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN mkdir -p /app/uploads /app/logs && chown -R node:node /app
USER node

EXPOSE 5005

CMD ["node", "server.js"]
