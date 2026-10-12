FROM node:22-alpine
WORKDIR /app
COPY football-bots/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund
COPY football-bots/group-worker.mjs ./group-worker.mjs
COPY football-original/lib/r55Settlement.js ./lib/r55Settlement.js
COPY football-original/lib/r55TelegramFormat.js ./lib/r55TelegramFormat.js
RUN printf '{"type":"module"}\n' > ./lib/package.json
USER node
EXPOSE 3030
CMD ["node","group-worker.mjs"]
