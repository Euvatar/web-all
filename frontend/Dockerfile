# Usar a imagem oficial do Node.js
FROM node:18

# Criar e definir o diretório de trabalho dentro do container
WORKDIR /usr/src/app

# Copiar o package.json e package-lock.json (se presente)
COPY package*.json ./

# Instalar as dependências do projeto
RUN npm install

# Copiar todo o código para dentro do container
COPY . .

# Expor a porta que o servidor estará ouvindo
EXPOSE 8001

# Comando para rodar a aplicação
CMD ["node", "server.js"]
