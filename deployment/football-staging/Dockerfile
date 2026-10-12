FROM node:22-alpine
WORKDIR /app
COPY cache.mjs /app/cache.mjs
RUN mkdir -p /cache && chown node:node /cache
USER node
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node","/app/cache.mjs"]
