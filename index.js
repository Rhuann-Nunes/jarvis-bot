// Carregar variáveis de ambiente primeiro
require('dotenv').config();

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const loadCommands = require('./commands');
const { supabase } = require('./config/supabase');
const messageHandler = require('./utils/messageHandler');
const sessionManager = require('./lib/session-manager');
const TaskWatcher = require('./lib/task-watcher');

// Definir timeout para limpeza de sessões (20 minutos = 1200000 ms)
const SESSION_TIMEOUT = 20 * 60 * 1000; 

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
            '--disable-gpu'
        ],
        defaultViewport: null,
        timeout: 60000, // Timeout maior para operações do Puppeteer (60 segundos)
        handleSIGINT: false, // Evita que o processo seja encerrado com CTRL+C
        handleSIGTERM: false,
        handleSIGHUP: false
    },
    // Adiciona um timeout maior para as operações do cliente
    qrTimeoutMs: 60000, // 60 segundos para escanear o QR
    authTimeoutMs: 120000 // 2 minutos para autenticação
});

// Variável para o watcher de tarefas
let taskWatcher = null;

// Carregar comandos
const commands = loadCommands();

// Verificar conexão com Supabase
supabase.from('user_preferences').select('count', { count: 'exact', head: true })
    .then(({ count, error }) => {
        if (error) {
            console.error('[INICIALIZAÇÃO] Erro ao conectar com o Supabase:', error);
        } else {
            console.log(`[INICIALIZAÇÃO] Conectado ao Supabase. Total de usuários: ${count || 0}`);
        }
    })
    .catch(err => {
        console.error('[INICIALIZAÇÃO] Falha ao testar conexão com Supabase:', err);
    });

// Evento quando o QR code é recebido
client.on('qr', (qr) => {
    console.log('[AUTENTICAÇÃO] QR Code recebido, escaneie-o com seu telefone:');
    qrcode.generate(qr, {small: true});
});

// Evento quando o cliente está pronto
client.on('ready', () => {
    console.log('[SISTEMA] Bot está pronto e conectado!');
    console.log(`[SISTEMA] Comandos carregados: ${commands.size}`);
    
    // Verificar quais métodos o cliente tem disponível
    const clientMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(client));
    console.log('[SISTEMA] Métodos disponíveis no cliente:', clientMethods.join(', '));
    
    // Iniciar o watcher de tarefas
    if (!taskWatcher) {
        taskWatcher = new TaskWatcher(client);
        taskWatcher.start();
    }
});

// Evento para reconexão
client.on('disconnected', (reason) => {
    console.log('[SISTEMA] Cliente desconectado:', reason);
    console.log('[SISTEMA] Tentando reconectar...');
    
    // Parar o watcher de tarefas durante a desconexão
    if (taskWatcher) {
        taskWatcher.stop();
        taskWatcher = null;
    }
    
    // Tenta reinicializar o cliente após um pequeno delay
    setTimeout(() => {
        client.initialize().catch(err => {
            console.error('[ERRO] Falha ao reinicializar após desconexão:', err);
        });
    }, 5000); // Aguarda 5 segundos antes de tentar reconectar
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
    } catch (error) {
        console.error('[ERRO] Falha ao verificar sessões expiradas:', error);
    }
}

// Verificar sessões expiradas a cada minuto
setInterval(checkExpiredSessions, 60000);

// Tratamento de erros não capturados
process.on('uncaughtException', (err) => {
    console.error('[ERRO CRÍTICO] Exceção não capturada:', err);
    // Não encerrar o processo para manter o bot funcionando
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[ERRO CRÍTICO] Promessa rejeitada não tratada:', reason);
    // Não encerrar o processo para manter o bot funcionando
});

// Função de encerramento limpo
function cleanShutdown() {
    console.log('[SISTEMA] Encerrando o bot...');
    
    // Parar o watcher de tarefas
    if (taskWatcher) {
        taskWatcher.stop();
        taskWatcher = null;
    }
    
    // Finalizar o gerenciador de sessões
    sessionManager.shutdown();
    
    // Outras limpezas necessárias
    
    console.log('[SISTEMA] Processo finalizado.');
    process.exit(0);
}

// Tratar sinais de encerramento
process.on('SIGINT', cleanShutdown);
process.on('SIGTERM', cleanShutdown);

// Iniciar o cliente com tratamento de erro
console.log('[INICIALIZAÇÃO] Iniciando cliente WhatsApp...');
client.initialize()
    .catch(err => {
        console.error('[ERRO] Falha ao inicializar cliente:', err);
        console.log('[RECUPERAÇÃO] Tentando reiniciar em 10 segundos...');
        
        // Tenta reiniciar após 10 segundos em caso de falha na inicialização
        setTimeout(() => {
            console.log('[RECUPERAÇÃO] Reiniciando cliente...');
            client.initialize().catch(e => console.error('[ERRO] Nova falha na inicialização:', e));
        }, 10000);
    }); 