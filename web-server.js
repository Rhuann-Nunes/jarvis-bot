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
const io = socketIo(server, {
  cors: {
    origin: '*', // Permitir qualquer origem
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling']
});

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
  
  // Quando o cliente desconecta
  socket.on('disconnect', () => {
    console.log('Cliente desconectado do painel web');
  });
});

// Iniciar o servidor
function startServer() {
  // O Railway está definindo a porta como 8080
  const port = process.env.PORT || 8080;
  
  // Logar informações de ambiente para debug
  console.log(`Variáveis de ambiente: PORT=${process.env.PORT}, WEB_PORT=${process.env.WEB_PORT}`);
  
  server.listen(port, '0.0.0.0', () => {
    console.log(`Servidor web rodando na porta ${port}`);
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