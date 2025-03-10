FROM node:18-slim

# Instalar dependências essenciais
RUN apt-get update \
    && apt-get install -y wget gnupg xvfb \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y \
        google-chrome-stable \
        libgbm-dev \
        libasound2 \
        libatk1.0-0 \
        libcairo2 \
        libcups2 \
        libgdk-pixbuf2.0-0 \
        libgtk-3-0 \
        libnspr4 \
        libpango-1.0-0 \
        libxss1 \
        libxtst6 \
        fonts-liberation \
        libappindicator1 \
        libnss3 \
        xdg-utils \
        --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Criar diretório de trabalho
WORKDIR /app

# Copiar package.json e package-lock.json
COPY package*.json ./

# Instalar dependências
RUN npm install

# Copiar o resto dos arquivos
COPY . .

# Expor a porta que o servidor web usa
EXPOSE 3000

# Definir variável de ambiente para o Chrome
ENV CHROME_BIN=/usr/bin/google-chrome

# Script de inicialização
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Comando para iniciar o bot
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "start"] 