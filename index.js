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
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-webgl',
            '--disable-infobars',
            '--window-position=0,0',
            '--ignore-certificate-errors',
            '--ignore-certificate-errors-spki-list',
            '--user-agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.54 Safari/537.36"'
        ],
        defaultViewport: null,
        timeout: 120000, // Timeout maior (2 minutos)
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false,
        dumpio: true // Adiciona logs do browser para debug
    },
    // Adiciona um timeout maior para as operações do cliente
    qrTimeoutMs: 120000, // 2 minutos para escanear o QR
    authTimeoutMs: 180000, // 3 minutos para autenticação
    restartOnAuthFail: true, // Reinicia automaticamente em falha de autenticação
    takeoverOnConflict: true // Permite tomar controle de uma sessão existente
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

// Função para inicializar o cliente com tratamento de erros
async function initializeClient() {
    console.log('[INICIALIZAÇÃO] Iniciando cliente WhatsApp...');
    
    try {
        await client.initialize();
        return true;
    } catch (error) {
        console.error(`[ERRO] Falha ao inicializar cliente: ${error}`);
        
        // Tenta reiniciar após um delay
        console.log('[RECUPERAÇÃO] Tentando reiniciar em 10 segundos...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        try {
            console.log('[RECUPERAÇÃO] Reiniciando cliente...');
            // Força a destruição do cliente anterior
            try {
                await client.destroy();
            } catch (e) {
                // Ignora erros na destruição
            }
            
            // Reinicia o cliente
            await client.initialize();
            return true;
        } catch (retryError) {
            console.error(`[ERRO] Nova falha na inicialização: ${retryError}`);
            return false;
        }
    }
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

// Inicializar o cliente ao iniciar a aplicação
initializeClient().then(success => {
    if (!success) {
        console.error('[SISTEMA] Falha ao inicializar o cliente após tentativas.');
    }
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
    
    // Iniciar sessão de administrador
    createSession('admin');
    
    // Iniciar o monitor de tarefas
    taskWatcher.start();
    
    // Atualizar status do bot
    updateBotStatus({ connected: true });
});

// Evento para reconexão
client.on('disconnected', async (reason) => {
    console.log(`Bot desconectado: ${reason}`);
    
    // Parar o monitor de tarefas
    taskWatcher.stop();
    
    // Atualizar status do bot
    updateBotStatus({ connected: false });
    
    // Tentar reconectar com mais robustez
    console.log('Tentando reconectar após desconexão...');
    
    // Aguarda 5 segundos antes de tentar reconectar
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Tenta inicializar novamente usando nossa função robusta
    const success = await initializeClient();
    if (!success) {
        console.error('[SISTEMA] Falha na reconexão após várias tentativas.');
        // Notificar o servidor web
        webServer.sendLog('[ERRO CRÍTICO] Falha na reconexão após várias tentativas.');
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