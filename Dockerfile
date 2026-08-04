# Usa la imagen de Node.js
FROM node:20-slim

# Establece el directorio de trabajo
WORKDIR /app

# Copia package.json y package-lock.json
COPY package*.json ./

# Instala dependencias
RUN npm install

# Copia el resto del código
COPY . .

# Expone el puerto
EXPOSE 8080

# Inicia la aplicación
CMD ["npm", "start"]
