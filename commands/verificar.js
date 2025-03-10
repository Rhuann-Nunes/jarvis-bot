const dbUtils = require('../utils/database');

module.exports = {
    name: 'verificar',
    description: 'Verifica se um número existe na tabela user_preferences',
    trigger: '!verificar',
    execute: async (message) => {
        try {
            // Extrair o número a ser verificado
            const numeroParaVerificar = message.body.slice('!verificar'.length).trim();
            
            if (!numeroParaVerificar) {
                await message.reply(`
Para verificar um número, use o formato:
!verificar [numero]

Exemplos:
!verificar 62994493774
!verificar 5562994493774
                `.trim());
                return;
            }

            console.log(`[COMANDO:verificar] Verificando número ${numeroParaVerificar}...`);
            
            // Chamar a função verificarUsuario
            const { exists, username, error, formatoEncontrado } = await dbUtils.verificarUsuario(numeroParaVerificar);
            
            if (error) {
                console.error(`[COMANDO:verificar] Erro ao verificar número ${numeroParaVerificar}:`, error);
                await message.reply('Ocorreu um erro ao verificar o número. Por favor, tente novamente mais tarde.');
                return;
            }

            // Preparar resposta
            let resposta = '';
            
            if (exists) {
                resposta = `✅ Número ${numeroParaVerificar} ENCONTRADO!\n\n`;
                resposta += `👤 Usuário: ${username || 'Nome não disponível'}\n`;
                resposta += `📱 Formato encontrado no banco: ${formatoEncontrado}\n`;
                resposta += `\nEste número está registrado na plataforma JARVIS.`;
            } else {
                resposta = `❌ Número ${numeroParaVerificar} NÃO ENCONTRADO\n\n`;
                resposta += `O número não está registrado na plataforma JARVIS.\n`;
                resposta += `Verifique se digitou o número corretamente.\n`;
                resposta += `\nFormatos testados:\n`;
                
                // Adicionar informações sobre os formatos testados
                if (numeroParaVerificar.length >= 10) {
                    let numeroSemPais = numeroParaVerificar.replace(/^55/, '');
                    resposta += `- ${numeroSemPais}\n`;
                    
                    if (numeroSemPais.length === 10) {
                        resposta += `- ${numeroSemPais.substring(0, 2)}9${numeroSemPais.substring(2)}\n`;
                    }
                    
                    if (numeroSemPais.length === 11) {
                        resposta += `- ${numeroSemPais.substring(0, 2)}${numeroSemPais.substring(3)}\n`;
                    }
                }
            }
            
            await message.reply(resposta);
            console.log(`[COMANDO:verificar] Resposta enviada para verificação do número ${numeroParaVerificar}`);
            
        } catch (error) {
            console.error('[COMANDO:verificar] Erro inesperado:', error);
            await message.reply('Ocorreu um erro ao processar seu comando.');
        }
    }
}; 