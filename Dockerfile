FROM node:18-bullseye

# Instalar Chrome e dependências
RUN apt-get update \
    && apt-get install -y wget gnupg procps \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y \
        google-chrome-stable \
        fonts-liberation \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libatspi2.0-0 \
        libcups2 \
        libdbus-1-3 \
        libdrm2 \
        libgbm1 \
        libgtk-3-0 \
        libnspr4 \
        libnss3 \
        libxcomposite1 \
        libxdamage1 \
        libxfixes3 \
        libxrandr2 \
        xdg-utils \
        --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /root/.cache/puppeteer

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

# Definir variáveis de ambiente
ENV CHROME_BIN=/usr/bin/google-chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production
ENV DEBUG=puppeteer:*,whatsapp-web:*
ENV PUPPETEER_DEBUG=true

# Comando para iniciar o bot
CMD ["npm", "start"] 