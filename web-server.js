/**
 * Servidor web para exibir QR code e logs do bot em tempo real
 */
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const qrcode = require('qrcode');

// Configuração do servidor
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Pasta pública para arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Armazenar histórico de logs (limitado a 100 entradas)
const logHistory = [];
const MAX_LOG_HISTORY = 100;

// Armazenar o último QR code (se houver)
let lastQrCode = null;
// Armazenar o status atual do bot
let botStatus = {
  connected: false,
  api: {
    connected: false,
    url: process.env.JARVIS_API_URL || 'Não configurado'
  },
  sessions: 0
};

// Armazenar referência para o cliente WhatsApp
let whatsappClient = null;

// Rota principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Quando um cliente se conecta
io.on('connection', (socket) => {
  console.log('Novo cliente conectado ao painel web');
  
  // Enviar histórico de logs
  socket.emit('logHistory', logHistory);
  
  // Enviar o último QR code se estiver disponível
  if (lastQrCode) {
    socket.emit('qrCode', lastQrCode);
  }
  
  // Enviar o status atual do bot
  socket.emit('botStatus', botStatus);
  
  // Receber solicitação de envio de mensagem de teste
  socket.on('sendTestMessage', async ({ phone, message }) => {
    try {
      // Verificar se o bot está conectado
      if (!botStatus.connected) {
        throw new Error('Bot não está conectado ao WhatsApp');
      }

      // Verificar se o cliente está disponível
      if (!whatsappClient || !whatsappClient.info || !whatsappClient.info.wid) {
        throw new Error('Cliente WhatsApp não está pronto para enviar mensagens');
      }

      // Formatar número para o WhatsApp
      let formattedNumber = phone.replace(/\D/g, ''); // Remove não-dígitos
      if (!formattedNumber.startsWith('55')) {
        formattedNumber = '55' + formattedNumber;
      }

      // Garantir que o número está no formato correto para o WhatsApp
      // O WhatsApp espera o número sem o 9 após o DDD para números brasileiros
      if (formattedNumber.length === 13 && formattedNumber.startsWith('55')) {
        const ddd = formattedNumber.substring(2, 4);
        const numero = formattedNumber.substring(5); // Remove o 9
        formattedNumber = `55${ddd}${numero}`;
      }

      const whatsappNumber = `${formattedNumber}@c.us`;

      // Log de tentativa com número formatado
      const attemptLog = `[INFO] ${new Date().toLocaleTimeString()} - Tentando enviar mensagem para ${whatsappNumber}`;
      io.emit('log', attemptLog);
      logHistory.push(attemptLog);

      // Tentar enviar a mensagem
      await whatsappClient.sendMessage(whatsappNumber, message);
      
      // Log de sucesso
      const successLog = `[SUCCESS] ${new Date().toLocaleTimeString()} - Mensagem de teste enviada para ${whatsappNumber}`;
      io.emit('log', successLog);
      logHistory.push(successLog);
      
    } catch (error) {
      // Log de erro
      const errorLog = `[ERROR] ${new Date().toLocaleTimeString()} - Erro ao enviar mensagem de teste: ${error.message}`;
      io.emit('log', errorLog);
      logHistory.push(errorLog);
    }
  });
  
  // Quando o cliente desconecta
  socket.on('disconnect', () => {
    console.log('Cliente desconectado do painel web');
  });
});

// Iniciar o servidor
function startServer() {
  const port = process.env.WEB_PORT || 3000;
  
  server.listen(port, () => {
    console.log(`Servidor web rodando em http://localhost:${port}`);
  });
  
  // Lidar com erros do servidor
  server.on('error', (err) => {
    console.error('Erro no servidor web:', err);
  });
  
  // Retornar objeto com métodos para interagir com o servidor
  return {
    // Enviar log para todos os clientes
    sendLog: (log) => {
      // Adicionar ao histórico
      logHistory.push(log);
      // Limitar tamanho do histórico
      if (logHistory.length > MAX_LOG_HISTORY) {
        logHistory.shift();
      }
      // Enviar para todos os clientes
      io.emit('log', log);
    },
    
    // Enviar QR code para todos os clientes
    sendQrCode: async (qrData) => {
      try {
        // Gerar QR code como data URL
        const qrDataUrl = await qrcode.toDataURL(qrData);
        lastQrCode = qrDataUrl;
        io.emit('qrCode', qrDataUrl);
        return true;
      } catch (err) {
        console.error('Erro ao gerar QR code:', err);
        return false;
      }
    },
    
    // Atualizar e enviar status do bot
    updateBotStatus: (status) => {
      botStatus = { ...botStatus, ...status };
      io.emit('botStatus', botStatus);
    },
    
    // Definir o cliente WhatsApp
    setWhatsappClient: (client) => {
      whatsappClient = client;
      console.log('[WEB] Cliente WhatsApp configurado:', client ? 'Disponível' : 'Indisponível');
      
      // Atualizar status do bot
      if (client && client.info && client.info.wid) {
        botStatus.connected = true;
        botStatus.message = 'Bot conectado e pronto para enviar mensagens';
        io.emit('botStatus', botStatus);
      }
    },
    
    // Parar o servidor
    stop: () => {
      return new Promise((resolve) => {
        server.close(() => {
          console.log('Servidor web encerrado');
          resolve();
        });
      });
    }
  };
}

module.exports = { startServer }; 