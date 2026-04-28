FROM node:18-alpine

WORKDIR /app

# Копируем package.json и устанавливаем зависимости
COPY package*.json ./
RUN npm install

# Копируем ВЕСЬ код из папки backend
COPY . .

EXPOSE 3000

CMD ["node", "server-simple.js"]