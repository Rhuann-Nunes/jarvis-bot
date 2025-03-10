const dbUtils = require('../utils/database');

module.exports = {
    name: 'buscar',
    description: 'Busca mensagens por número de telefone',
    trigger: '!buscar',
    execute: async (message) => {
        try {
            // Extrair o telefone da mensagem
            const telefone = message.body.slice('!buscar'.length).trim();
            
            if (!telefone) {
                await message.reply('Por favor, forneça um número de telefone para buscar. Exemplo: !buscar 5511987654321');
                return;
            }

            // Consultar mensagens por telefone
            const { data, error } = await dbUtils.consultarMensagensPorTelefone(telefone);

            if (error) {
                console.error('Erro ao buscar mensagens:', error);
                await message.reply('Ocorreu um erro ao buscar as mensagens. Por favor, tente novamente mais tarde.');
                return;
            }

            if (!data || data.length === 0) {
                await message.reply(`Não foram encontradas mensagens para o telefone ${telefone}.`);
                return;
            }

            // Formatar as mensagens para exibição
            let response = `📱 Mensagens do telefone ${telefone}:\n\n`;
            
            data.forEach((msg, index) => {
                const date = new Date(msg.data_registro).toLocaleString('pt-BR');
                response += `${index + 1}. De: ${msg.nome_contato}\n`;
                response += `   Conteúdo: ${msg.conteudo}\n`;
                response += `   Data: ${date}\n\n`;
            });

            await message.reply(response);
            
        } catch (error) {
            console.error('Erro no comando buscar:', error);
            await message.reply('Ocorreu um erro ao processar seu comando.');
        }
    }
}; 