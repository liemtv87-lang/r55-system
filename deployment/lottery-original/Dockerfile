FROM node:22-alpine
WORKDIR /app
COPY lottery-original/server.mjs ./server.mjs
COPY lottery-original/public/client-vps.html ./public/client-vps.html
USER node
EXPOSE 3004
CMD ["node","server.mjs"]
