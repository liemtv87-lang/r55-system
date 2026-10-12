FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY compat ./compat
COPY lib ./lib
RUN npm install --omit=dev --no-audit --no-fund
COPY worker.mjs ./worker.mjs
COPY historyAudit.mjs ./historyAudit.mjs
RUN mkdir -p /data/history && chown -R node:node /data
USER node
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node","worker.mjs","serve"]
