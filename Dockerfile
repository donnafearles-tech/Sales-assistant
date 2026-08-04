FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8080

# 🔥 Comando que inicia tu proxy
CMD ["node", "backend/server.js"]
