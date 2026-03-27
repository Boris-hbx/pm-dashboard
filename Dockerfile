FROM node:22-alpine

WORKDIR /app

COPY web/ /app/web/
COPY data/ /app/data/
COPY server.js /app/server.js

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
