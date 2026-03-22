FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Gera hash do admin
RUN node -e "const b=require('bcryptjs');const h=b.hashSync('admin123',10);const fs=require('fs');fs.writeFileSync('/app/admin_hash.txt',h);"
# Cria diretórios de upload persistentes
RUN mkdir -p /app/uploads /app/docs && chmod 777 /app/uploads /app/docs
EXPOSE 3000
CMD ["node", "server.js"]
