FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Cloud Run utiliza el puerto 8080 por defecto
EXPOSE 8080

# Comando de inicio (Asegúrate de que backend/server.js exista en tu repo)
CMD ["node", "backend/server.js"]
