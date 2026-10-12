FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY worker.mjs payos-orders.mjs ./
USER node
EXPOSE 3032
CMD ["node","worker.mjs"]
