const { supabase } = require('../config/supabase');

module.exports = {
    name: 'usuarios',
    description: 'Lista usuários cadastrados no sistema',
    trigger: '!usuarios',
    execute: async (message) => {
        try {
            console.log(`[COMANDO:usuarios] Consultando usuários no Supabase...`);
            
            // Consultar usuários no Supabase (limitar a 10 para não sobrecarregar)
            const { data, error } = await supabase
                .from('user_preferences')
                .select('username, phone_number, allow_notifications, created_at')
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) {
                console.error('[COMANDO:usuarios] Erro ao consultar usuários:', error);
                await message.reply('Ocorreu um erro ao consultar os usuários. Por favor, tente novamente mais tarde.');
                return;
            }

            console.log(`[COMANDO:usuarios] Consulta bem-sucedida. Encontrados ${data?.length || 0} usuários.`);

            if (!data || data.length === 0) {
                await message.reply('Não há usuários cadastrados ainda.');
                return;
            }

            // Formatar os usuários para exibição
            let response = `👤 Últimos ${data.length} usuários cadastrados:\n\n`;
            
            data.forEach((user, index) => {
                const date = new Date(user.created_at).toLocaleString('pt-BR');
                response += `${index + 1}. Nome: ${user.username || 'Não informado'}\n`;
                response += `   Telefone: ${user.phone_number || 'Não informado'}\n`;
                response += `   Notificações: ${user.allow_notifications ? 'Sim' : 'Não'}\n`;
                response += `   Cadastrado em: ${date}\n\n`;
            });

            await message.reply(response);
            console.log(`[COMANDO:usuarios] Resposta enviada com ${data.length} usuários.`);
            
        } catch (error) {
            console.error('[COMANDO:usuarios] Erro inesperado:', error);
            await message.reply('Ocorreu um erro ao processar seu comando.');
        }
    }
}; 