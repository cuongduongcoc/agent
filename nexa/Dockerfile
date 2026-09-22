FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js data-loader.js ./
COPY agent/ ./agent/
COPY public/ ./public/
COPY data/ ./data/

ENV EXCEL_PATH=/app/data/dataset.xlsx
ENV PORT=8080

EXPOSE 8080

CMD ["node", "server.js"]
