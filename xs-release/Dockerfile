FROM kq247/lottery-original-ui:local
WORKDIR /app
COPY original-ui-locked-server.mjs /app/server.mjs
COPY neon-locked-overlay.mjs /app/neon-locked-overlay.mjs
USER node
EXPOSE 3004
CMD ["node","server.mjs"]
