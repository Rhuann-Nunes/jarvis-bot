// Carregar variáveis de ambiente primeiro
require('dotenv').config();

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const loadCommands = require('./commands');
const { supabase } = require('./config/supabase');
const messageHandler = require('./utils/messageHandler');
const sessionManager = require('./lib/session-manager');
const TaskWatcher = require('./lib/task-watcher');
const { startServer } = require('./web-server');

// Definir timeout para limpeza de sessões (20 minutos = 1200000 ms)
const SESSION_TIMEOUT = 20 * 60 * 1000; 

// Iniciar o servidor web
const webServer = startServer();

// Sobrescrever console.log e console.error para enviar para o front-end
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = function(...args) {
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg) : arg
  ).join(' ');
  originalConsoleLog.apply(console, args);
  webServer.sendLog(`[INFO] ${new Date().toLocaleTimeString()} - ${message}`);
};

console.error = function(...args) {
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg) : arg
  ).join(' ');
  originalConsoleError.apply(console, args);
  webServer.sendLog(`[ERROR] ${new Date().toLocaleTimeString()} - ${message}`);
};

// Inicializar o cliente WhatsApp com configurações melhoradas
const client = new Client({
    authStrategy: new LocalAuth({ clientId: "jarvis-whatsapp-bot" }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-dev-tools',
            '--disable-extensions',
            '--disable-default-apps',
            '--disable-sync',
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-breakpad',
            '--disable-client-side-phishing-detection',
            '--disable-component-extensions-with-background-pages',
            '--disable-features=TranslateUI,BlinkGenPropertyTrees',
            '--disable-ipc-flooding-protection',
            '--disable-popup-blocking',
            '--disable-prompt-on-repost',
            '--force-color-profile=srgb',
            '--metrics-recording-only',
            '--no-default-browser-check',
            '--password-store=basic',
            '--use-gl=swiftshader',
            '--use-mock-keychain',
            '--disable-notifications',
            '--disable-audio-output',
            '--disable-speech-api',
            '--disable-web-security',
            '--disable-features=AudioServiceOutOfProcess',
            '--disable-features=IsolateOrigins,site-per-process',
            '--window-size=1280,720'
        ],
        executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
        defaultViewport: {
            width: 1280,
            height: 720
        },
        ignoreHTTPSErrors: true,
        timeout: 120000,
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false,
        protocolTimeout: 120000,
        dumpio: true,
        pipe: true // Usar pipe ao invés de WebSocket
    },
    qrTimeoutMs: 120000,
    authTimeoutMs: 180000,
    takeoverOnConflict: true, // Tentar assumir a sessão em caso de conflito
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' // User agent fixo
});

// Variável para o watcher de tarefas
let taskWatcher = null;

// Carregar comandos
const commands = loadCommands();

// Função para atualizar o status do bot
function updateBotStatus(status = {}) {
  webServer.updateBotStatus({
    ...status,
    api: {
      connected: !!supabase,
      url: process.env.JARVIS_API_URL
    },
    sessions: sessionManager && sessionManager.sessions ? sessionManager.sessions.size : 0
  });
}

// Verificar conexão com Supabase
supabase.from('user_preferences').select('count', { count: 'exact', head: true })
    .then(({ count, error }) => {
        if (error) {
            console.error('[INICIALIZAÇÃO] Erro ao conectar com o Supabase:', error);
            updateBotStatus({ message: 'Erro ao conectar com Supabase', connected: false });
        } else {
            console.log(`[INICIALIZAÇÃO] Conectado ao Supabase. Total de usuários: ${count || 0}`);
            updateBotStatus({ message: 'Conectado ao Supabase', connected: false });
        }
    })
    .catch(err => {
        console.error('[INICIALIZAÇÃO] Falha ao testar conexão com Supabase:', err);
        updateBotStatus({ message: 'Falha ao conectar com Supabase', connected: false });
    });

// Evento quando o QR code é recebido
client.on('qr', async (qr) => {
  try {
    // Enviar QR para o servidor web
    await webServer.sendQrCode(qr);
    
    // Log para o console
    console.log('Novo QR code gerado. Escaneie-o com seu WhatsApp para autenticar o bot.');
    console.log('QR code também disponível na interface web.');
    
    // Atualizar status do bot
    updateBotStatus({ connected: false });
  } catch (error) {
    console.error(`Erro ao processar QR code: ${error.message}`);
  }
});

// Evento quando o cliente está pronto
client.on('ready', () => {
    console.log('JARVIS Bot está conectado!');
    
    // Primeiro configurar o cliente WhatsApp no servidor web
    webServer.setWhatsappClient(client);
    console.log('Cliente WhatsApp configurado no servidor web');
    
    // Atualizar status do bot
    updateBotStatus({ 
        connected: true,
        message: 'Bot conectado e pronto para enviar mensagens'
    });
    
    // Inicializar e iniciar o monitor de tarefas
    taskWatcher = new TaskWatcher(client);
    taskWatcher.start();
});

// Evento para reconexão
client.on('disconnected', async (reason) => {
    console.log(`Bot desconectado: ${reason}`);
    
    // Parar o monitor de tarefas
    taskWatcher.stop();
    
    // Atualizar status do bot
    updateBotStatus({ connected: false });
    
    // Tentar reconectar
    try {
        console.log('Tentando reconectar...');
        await client.initialize();
    } catch (error) {
        console.error(`Falha ao reconectar: ${error.message}`);
    }
});

// Contador de mensagens recebidas para logs
let mensagemCounter = 0;

// Função para registrar atividade no log
function logActivity(type, number, message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${type}] [${number}] ${message}`);
}

// Função auxiliar para simular digitação
async function simulateTyping(chatId) {
    try {
        if (typeof client.sendPresenceAvailable === 'function') {
            await client.sendPresenceAvailable();
        }
        
        if (typeof client.sendSeen === 'function') {
            await client.sendSeen(chatId);
        }
        
        // Tentar diferentes métodos para "digitando..."
        // Alguns desses podem funcionar dependendo da versão da biblioteca
        const typingMethods = [
            'sendStateTyping',
            'setChatState', 
            'setPresence',
            'startTyping'
        ];
        
        for (const method of typingMethods) {
            if (typeof client[method] === 'function') {
                try {
                    if (method === 'setChatState') {
                        await client[method](chatId, 'typing');
                    } else if (method === 'setPresence') {
                        await client[method]('available');
                        await client[method]('composing', chatId);
                    } else {
                        await client[method](chatId);
                    }
                    console.log(`[TYPING] Usado método ${method} com sucesso`);
                    break;
                } catch (e) {
                    console.log(`[TYPING] Falha ao usar método ${method}: ${e.message}`);
                }
            }
        }
    } catch (error) {
        console.log(`[TYPING] Erro ao simular digitação: ${error.message}`);
    }
}

// Função auxiliar para parar simulação de digitação
async function stopTyping(chatId) {
    try {
        // Tentar diferentes métodos para parar "digitando..."
        const stopTypingMethods = [
            'sendStateIdle',
            'setChatState',
            'setPresence',
            'stopTyping'
        ];
        
        for (const method of stopTypingMethods) {
            if (typeof client[method] === 'function') {
                try {
                    if (method === 'setChatState') {
                        await client[method](chatId, 'idle');
                    } else if (method === 'setPresence') {
                        await client[method]('available');
                        await client[method]('paused', chatId);
                    } else {
                        await client[method](chatId);
                    }
                    console.log(`[TYPING] Parado usando método ${method}`);
                    break;
                } catch (e) {
                    console.log(`[TYPING] Falha ao usar método ${method} para parar: ${e.message}`);
                }
            }
        }
    } catch (error) {
        console.log(`[TYPING] Erro ao parar digitação: ${error.message}`);
    }
}

// Evento para lidar com mensagens recebidas
client.on('message', async (message) => {
    mensagemCounter++;
    const mensagemId = mensagemCounter;
    const timestamp = new Date().toISOString();
    
    console.log(`[MENSAGEM #${mensagemId}] [${timestamp}] De: ${message.from} Texto: ${message.body}`);
    
    try {
        // Primeiro verificar se é um comando
        let isCommand = false;
        for (const [trigger, command] of commands.entries()) {
            if (message.body.toLowerCase().startsWith(trigger)) {
                try {
                    console.log(`[COMANDO #${mensagemId}] Executando "${command.name}"...`);
                    await command.execute(message);
                    console.log(`[COMANDO #${mensagemId}] "${command.name}" executado com sucesso`);
                    isCommand = true;
                } catch (error) {
                    console.error(`[ERRO #${mensagemId}] Falha ao executar comando "${command.name}":`, error);
                    await message.reply('Ocorreu um erro ao executar este comando.');
                }
                break;
            }
        }

        // Se não for um comando, processar com o JARVIS
        if (!isCommand) {
            console.log(`[MENSAGEM #${mensagemId}] Processando com JARVIS...`);
            
            // Criar um objeto typing com funções corretas para status
            const typingHelpers = {
                startTyping: () => simulateTyping(message.from),
                stopTyping: () => stopTyping(message.from)
            };
            
            await messageHandler.processarMensagem(message, typingHelpers, mensagemId);
        }
        
        // Atualizar o status para contabilizar sessões
        updateBotStatus();
    } catch (error) {
        console.error(`[ERRO GERAL #${mensagemId}] Falha ao processar mensagem:`, error);
    }
});

// Função para limpar sessões expiradas
function checkExpiredSessions() {
    try {
        // O gerenciador de sessões já implementa a verificação e limpeza
        // Esta chamada é apenas para registrar que a verificação está ocorrendo
        logActivity('SESSÕES', 'SISTEMA', `Verificando sessões expiradas. Limite de inatividade: ${SESSION_TIMEOUT/60000} minutos`);
        
        // Atualizar o status para contabilizar sessões
        updateBotStatus();
    } catch (error) {
        console.error('[ERRO] Falha ao verificar sessões expiradas:', error);
    }
}

// Verificar sessões expiradas a cada minuto
setInterval(checkExpiredSessions, 60000);

// Tratamento de erros não capturados
process.on('uncaughtException', (err) => {
    console.error('[ERRO CRÍTICO] Exceção não capturada:', err);
    updateBotStatus({ 
      message: 'Erro crítico: Exceção não capturada', 
      connected: client?.info?.wid ? true : false
    });
    // Não encerrar o processo para manter o bot funcionando
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[ERRO CRÍTICO] Promessa rejeitada não tratada:', reason);
    updateBotStatus({ 
      message: 'Erro crítico: Promessa rejeitada', 
      connected: client?.info?.wid ? true : false
    });
    // Não encerrar o processo para manter o bot funcionando
});

// Função de encerramento limpo
function cleanShutdown() {
    console.log('Encerrando o bot...');
    
    // Parar o servidor web
    webServer.stop()
        .then(() => {
            // Parar o monitor de tarefas
            if (taskWatcher) {
                taskWatcher.stop();
            }
            
            // Limpar as sessões
            cleanupExpiredSessions(true);
            
            // Desconectar o cliente WhatsApp
            if (client && client.isConnected) {
                return client.destroy();
            }
        })
        .then(() => {
            console.log('Bot encerrado com sucesso');
            process.exit(0);
        })
        .catch(err => {
            console.error(`Erro ao encerrar o bot: ${err.message}`);
            process.exit(1);
        });
}

// Capturar sinais para encerramento limpo
process.on('SIGINT', cleanShutdown);
process.on('SIGTERM', cleanShutdown);

// Iniciar o cliente com tratamento de erro
console.log('[INICIALIZAÇÃO] Iniciando cliente WhatsApp...');
updateBotStatus({ message: 'Iniciando cliente WhatsApp', connected: false });

client.initialize()
    .catch(err => {
        console.error('[ERRO] Falha ao inicializar cliente:', err);
        console.log('[RECUPERAÇÃO] Tentando reiniciar em 10 segundos...');
        updateBotStatus({ 
          message: 'Falha ao inicializar, tentando novamente em 10s', 
          connected: false
        });
        
        // Tenta reiniciar após 10 segundos em caso de falha na inicialização
        setTimeout(() => {
            console.log('[RECUPERAÇÃO] Reiniciando cliente...');
            client.initialize().catch(e => {
                console.error('[ERRO] Nova falha na inicialização:', e);
                updateBotStatus({ 
                  message: 'Falha na reinicialização', 
                  connected: false
                });
            });
        }, 10000);
    }); 