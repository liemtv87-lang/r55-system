FROM node:24-alpine
WORKDIR /app
COPY sales-vps/package.json ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund
COPY sales-vps/server.mjs ./
USER node
ENV NODE_ENV=production SALES_BOT_ACTIVE=0 PORT=3010
EXPOSE 3010
CMD ["node","server.mjs"]
