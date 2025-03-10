const fs = require('fs');
const path = require('path');

// Carrega todos os comandos da pasta commands
const loadCommands = () => {
    const commands = new Map();
    const commandFiles = fs.readdirSync(__dirname)
        .filter(file => file !== 'index.js' && file.endsWith('.js'));

    for (const file of commandFiles) {
        const command = require(path.join(__dirname, file));
        commands.set(command.trigger, command);
        console.log(`Comando carregado: ${command.name}`);
    }

    return commands;
};

module.exports = loadCommands; 