const dbUtils = require('./database');
const sessionManager = require('../lib/session-manager');

/**
 * Processa mensagens recebidas e interage com a API JARVIS
 */
const messageHandler = {
    /**
     * Processa uma mensagem e responde usando a API JARVIS
     * @param {Object} message - Objeto da mensagem do whatsapp-web.js
     * @param {Object} typingHelpers - Objeto com funções para controlar status de digitação
     * @param {number} mensagemId - ID sequencial da mensagem para logs
     * @returns {Promise<void>}
     */
    processarMensagem: async (message, typingHelpers, mensagemId = 0) => {
        try {
            // Não processar mensagens que são comandos
            if (message.body.startsWith('!')) {
                return;
            }

            // Ignorar mensagens de grupos
            if (message.isGroupMsg) {
                console.log(`[GRUPO #${mensagemId}] Ignorando mensagem de grupo: ${message.from}`);
                return;
            }
            
            // Obter informações do remetente
            const sender = await message.getContact();
            const numeroCompleto = sender.number;
            
            console.log(`[VERIFICAÇÃO #${mensagemId}] Mensagem de ${numeroCompleto} - Consultando Supabase...`);
            
            // Verificar se o usuário existe e tem permissão para usar o JARVIS
            const user = await dbUtils.getUserByPhoneNumber(numeroCompleto);
            
            if (!user) {
                console.log(`[RESULTADO #${mensagemId}] ${numeroCompleto} - Usuário NÃO ENCONTRADO ou não tem permissão`);
                
                // Usuário não registrado - enviar mensagem de boas-vindas
                const welcomeMessage = `
Olá! Sou JARVIS, uma inteligência artificial especializada em potencializar seu desempenho pessoal e profissional. 🚀

Notei que você ainda não está registrado em nosso sistema. Gostaria de convidá-lo a experimentar gratuitamente nossa plataforma, onde você terá acesso a:

• Assistência personalizada para otimizar sua produtividade
• Organização inteligente de tarefas e compromissos
• Recomendações baseadas em IA para melhorar seu desempenho
• Insights valiosos para tomada de decisões mais eficientes

Junte-se a milhares de pessoas que já estão revolucionando sua rotina diária com o poder da IA.

✨ Acesse agora mesmo: https://jarvis-gilt-eight.vercel.app/

Bem-vindo à nova era da produtividade!
                `.trim();
                
                await message.reply(welcomeMessage);
                console.log(`[RESPOSTA #${mensagemId}] Enviado convite para cadastro: ${numeroCompleto}`);
                return;
            }
            
            // Se o usuário não habilitou notificações
            if (!user.allowNotifications) {
                console.log(`[RESULTADO #${mensagemId}] ${numeroCompleto} - Usuário encontrado mas NÃO HABILITOU notificações`);
                await message.reply(`Olá, ${user.userName}! Para utilizar o JARVIS via WhatsApp, é necessário habilitar as notificações em seu perfil.\n\nAcesse https://jarvis-gilt-eight.vercel.app/ e ative as notificações em suas preferências.`);
                return;
            }
            
            console.log(`[RESULTADO #${mensagemId}] ${numeroCompleto} - Usuário ENCONTRADO e AUTORIZADO: ${user.userName} (${user.userId})`);
            
            // Verificar por comandos especiais
            if (message.body.toLowerCase() === '/help' || message.body.toLowerCase() === 'ajuda') {
                await message.reply(
                    "🤖 *JARVIS - Assistente Pessoal*\n\n" +
                    "Eu sou seu assistente JARVIS e posso responder suas perguntas diretamente aqui no WhatsApp.\n\n" +
                    "*Comandos disponíveis:*\n" +
                    "- /help ou ajuda: Mostra esta mensagem\n" +
                    "- /reiniciar: Reinicia nossa conversa\n\n" +
                    "Para começar, basta enviar qualquer pergunta!"
                );
                console.log(`[COMANDO #${mensagemId}] Comando /help processado para ${numeroCompleto}`);
                return;
            }
            
            if (message.body.toLowerCase() === '/reiniciar') {
                // Reiniciar a sessão do usuário
                sessionManager.resetSession(user.userId, user.userName);
                await message.reply("Conversa reiniciada! Em que posso ajudar?");
                console.log(`[COMANDO #${mensagemId}] Sessão reiniciada para ${numeroCompleto}`);
                return;
            }
            
            // Simular digitação usando os helpers fornecidos
            try {
                if (typingHelpers && typeof typingHelpers.startTyping === 'function') {
                    await typingHelpers.startTyping();
                    console.log(`[DIGITANDO #${mensagemId}] Simulação de digitação iniciada`);
                }
            } catch (typingError) {
                console.log(`[INFO #${mensagemId}] Não foi possível iniciar digitação: ${typingError.message}`);
            }
            
            // Obter ou criar sessão JARVIS
            try {
                console.log(`[JARVIS #${mensagemId}] Inicializando sessão para ${user.userId}`);
                const jarvis = await sessionManager.initSession(user.userId, user.userName);
                
                // Enviar mensagem para API JARVIS
                console.log(`[JARVIS #${mensagemId}] Enviando mensagem para API: "${message.body.substring(0, 50)}${message.body.length > 50 ? '...' : ''}"`);
                const response = await jarvis.sendMessage(message.body);
                
                // Parar digitação
                try {
                    if (typingHelpers && typeof typingHelpers.stopTyping === 'function') {
                        await typingHelpers.stopTyping();
                        console.log(`[DIGITANDO #${mensagemId}] Simulação de digitação finalizada`);
                    }
                } catch (idleError) {
                    console.log(`[INFO #${mensagemId}] Não foi possível parar digitação: ${idleError.message}`);
                }
                
                // Enviar resposta
                await message.reply(response);
                console.log(`[JARVIS #${mensagemId}] Resposta enviada para ${numeroCompleto}`);
                
            } catch (jarvisError) {
                console.error(`[ERRO #${mensagemId}] Falha ao processar com JARVIS:`, jarvisError.message);
                
                // Parar digitação em caso de erro
                try {
                    if (typingHelpers && typeof typingHelpers.stopTyping === 'function') {
                        await typingHelpers.stopTyping();
                        console.log(`[DIGITANDO #${mensagemId}] Simulação de digitação interrompida após erro`);
                    }
                } catch (idleError) {
                    console.log(`[INFO #${mensagemId}] Não foi possível parar digitação após erro: ${idleError.message}`);
                }
                
                await message.reply("Desculpe, estou enfrentando dificuldades técnicas no momento. Por favor, tente novamente mais tarde.");
            }
            
        } catch (error) {
            console.error(`[ERRO #${mensagemId}] Falha ao processar mensagem de ${message?.from || 'desconhecido'}:`, error);
            try {
                await message.reply("Ocorreu um erro ao processar sua mensagem. Por favor, tente novamente em alguns instantes.");
            } catch (replyError) {
                console.error(`[ERRO #${mensagemId}] Falha ao enviar resposta de erro:`, replyError);
            }
        }
    }
};

module.exports = messageHandler; 