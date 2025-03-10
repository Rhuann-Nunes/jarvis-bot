const dbUtils = require('../utils/database');

module.exports = {
    name: 'consultar',
    description: 'Consulta as últimas mensagens registradas',
    trigger: '!consultar',
    execute: async (message) => {
        try {
            // Consultar as últimas 5 mensagens (ou a quantidade especificada)
            let limit = 5;
            const args = message.body.slice('!consultar'.length).trim();
            
            if (args) {
                const parsedLimit = parseInt(args);
                if (!isNaN(parsedLimit) && parsedLimit > 0 && parsedLimit <= 20) {
                    limit = parsedLimit;
                }
            }

            // Consultar no Supabase usando a função utilitária
            const { data, error } = await dbUtils.consultarMensagens(limit);

            if (error) {
                console.error('Erro ao consultar mensagens:', error);
                await message.reply('Ocorreu um erro ao consultar as mensagens. Por favor, tente novamente mais tarde.');
                return;
            }

            if (!data || data.length === 0) {
                await message.reply('Não há mensagens registradas ainda.');
                return;
            }

            // Formatar as mensagens para exibição
            let response = `📋 Últimas ${data.length} mensagens:\n\n`;
            
            data.forEach((msg, index) => {
                const date = new Date(msg.data_registro).toLocaleString('pt-BR');
                response += `${index + 1}. De: ${msg.nome_contato}\n`;
                response += `   Telefone: ${msg.telefone}\n`;
                response += `   Conteúdo: ${msg.conteudo}\n`;
                response += `   Data: ${date}\n\n`;
            });

            await message.reply(response);
            
        } catch (error) {
            console.error('Erro no comando consultar:', error);
            await message.reply('Ocorreu um erro ao processar seu comando.');
        }
    }
}; 