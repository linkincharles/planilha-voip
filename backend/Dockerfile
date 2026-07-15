FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Gera hash do admin
RUN node -e "const b=require('bcryptjs');const h=b.hashSync('admin123',10);const fs=require('fs');fs.writeFileSync('/app/admin_hash.txt',h);"
# Diretórios de upload persistentes (pertence ao usuário node)
RUN mkdir -p /app/uploads /app/docs && chown -R node:node /app/uploads /app/docs
USER node
EXPOSE 3000
CMD ["node", "server.js"]
