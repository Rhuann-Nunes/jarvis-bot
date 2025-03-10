// Script para iniciar o bot com monitoramento de falhas e reinício automático
const { spawn } = require('child_process');
const path = require('path');

// Variável para armazenar o processo atual
let currentProcess = null;

/**
 * Função para iniciar o bot e monitorar sua execução
 */
function startBot() {
    console.log('\n[MONITOR] Iniciando o WhatsApp Bot...');
    
    // Inicia o bot como um processo filho
    currentProcess = spawn('node', [path.join(__dirname, 'index.js')], {
        stdio: 'inherit', // Compartilha a entrada/saída com o processo pai
        shell: true
    });

    // Monitor de encerramento do processo
    currentProcess.on('close', (code) => {
        console.log(`\n[MONITOR] Bot encerrado com código ${code}`);
        currentProcess = null;
        
        if (code !== 0) {
            console.log('[MONITOR] Detectada falha, reiniciando em 10 segundos...');
            
            // Aguardar 10 segundos antes de reiniciar
            setTimeout(() => {
                console.log('[MONITOR] Reiniciando o bot...');
                startBot();
            }, 10000);
        } else {
            console.log('[MONITOR] Bot encerrado normalmente.');
        }
    });

    // Monitor de erros do processo
    currentProcess.on('error', (err) => {
        console.error('[MONITOR] Erro ao iniciar processo:', err);
        console.log('[MONITOR] Tentando reiniciar em 10 segundos...');
        currentProcess = null;
        
        setTimeout(startBot, 10000);
    });
}

// Função para encerrar o bot de forma limpa
function shutdownBot() {
    console.log('\n[MONITOR] Processo interrompido pelo usuário. Encerrando...');
    
    if (currentProcess) {
        // Enviar sinal SIGTERM para o processo filho para que ele possa realizar o cleanup
        currentProcess.kill('SIGTERM');
        
        // Aguardar um tempo para o processo realizar o cleanup
        setTimeout(() => {
            // Se o processo ainda estiver em execução, forçar o encerramento
            if (currentProcess) {
                console.log('[MONITOR] Forçando encerramento do processo...');
                currentProcess.kill('SIGKILL');
            }
            process.exit(0);
        }, 5000);
    } else {
        process.exit(0);
    }
}

// Iniciar o bot
startBot();

// Tratamento de sinais do sistema para encerramento limpo
process.on('SIGINT', shutdownBot);
process.on('SIGTERM', shutdownBot); 