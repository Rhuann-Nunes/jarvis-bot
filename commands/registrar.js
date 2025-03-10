const dbUtils = require('../utils/database');

module.exports = {
    name: 'registrar',
    description: 'Registra uma mensagem no banco de dados',
    trigger: '!registrar',
    execute: async (message) => {
        try {
            // Extrair o conteúdo após o comando
            const content = message.body.slice('!registrar'.length).trim();
            
            if (!content) {
                await message.reply('Por favor, forneça um conteúdo para registrar. Exemplo: !registrar Minha mensagem');
                return;
            }

            // Obter informações do remetente
            const sender = await message.getContact();
            
            // Registrar no Supabase usando a função utilitária
            const { data, error } = await dbUtils.registrarMensagem({
                telefone: sender.number,
                nome_contato: sender.name || sender.pushname || 'Desconhecido',
                conteudo: content
            });

            if (error) {
                console.error('Erro ao registrar mensagem:', error);
                await message.reply('Ocorreu um erro ao registrar sua mensagem. Por favor, tente novamente mais tarde.');
                return;
            }

            await message.reply('✅ Mensagem registrada com sucesso!');
            
        } catch (error) {
            console.error('Erro no comando registrar:', error);
            await message.reply('Ocorreu um erro ao processar seu comando.');
        }
    }
}; 