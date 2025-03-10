// Comando simples de ping
module.exports = {
    name: 'ping',
    description: 'Responde com pong',
    trigger: '!ping',
    execute: async (message) => {
        await message.reply('pong');
    }
}; 