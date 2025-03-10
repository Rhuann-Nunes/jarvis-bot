const { supabase } = require('../config/supabase');

module.exports = {
    name: 'tarefas',
    description: 'Verifica tarefas próximas do vencimento',
    trigger: '!tarefas',
    execute: async (message) => {
        try {
            // Verificar se há um argumento para especificar minutos
            let minutosParametro = 30; // Padrão: 30 minutos
            const argMinutos = message.body.slice('!tarefas'.length).trim();
            
            if (argMinutos) {
                const parsed = parseInt(argMinutos);
                if (!isNaN(parsed) && parsed > 0 && parsed <= 1440) { // Máximo 24 horas (1440 minutos)
                    minutosParametro = parsed;
                }
            }

            console.log(`[COMANDO:tarefas] Verificando tarefas próximas do vencimento nos próximos ${minutosParametro} minutos`);
            
            // Calcular o intervalo de tempo
            const now = new Date();
            const futureTime = new Date(now.getTime() + (minutosParametro * 60 * 1000));
            
            // Fuso horário de Brasília (-3 horas de UTC)
            const timezoneOffset = -3 * 60 * 60 * 1000;
            
            // Ajustar para UTC pois o banco armazena em UTC
            const nowUTC = new Date(now.getTime() - timezoneOffset).toISOString();
            const futureTimeUTC = new Date(futureTime.getTime() - timezoneOffset).toISOString();
            
            // Buscar tarefas que vencem em breve
            const { data: tasks, error } = await supabase
                .from('tasks')
                .select(`
                    id, 
                    title, 
                    due_date, 
                    user_id, 
                    project_id,
                    completed
                `)
                .eq('completed', false)
                .gt('due_date', nowUTC)
                .lt('due_date', futureTimeUTC)
                .order('due_date', { ascending: true });
            
            if (error) {
                console.error('[COMANDO:tarefas] Erro ao buscar tarefas:', error);
                await message.reply('Ocorreu um erro ao verificar tarefas. Por favor, tente novamente.');
                return;
            }
            
            if (!tasks || tasks.length === 0) {
                await message.reply(`Não foram encontradas tarefas para os próximos ${minutosParametro} minutos.`);
                return;
            }
            
            // Construir a resposta
            let resposta = `📋 *Tarefas para os próximos ${minutosParametro} minutos:*\n\n`;
            
            for (const task of tasks) {
                // Buscar dados do projeto
                let projectName = "Sem projeto";
                if (task.project_id) {
                    const { data: project } = await supabase
                        .from('projects')
                        .select('name')
                        .eq('id', task.project_id)
                        .single();
                    
                    if (project) {
                        projectName = project.name;
                    }
                }
                
                // Converter para horário de Brasília
                const dueDate = new Date(new Date(task.due_date).getTime() + timezoneOffset);
                const formattedDate = dueDate.toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                // Buscar usuário da tarefa
                const { data: userPreference } = await supabase
                    .from('user_preferences')
                    .select('username')
                    .eq('user_id', task.user_id)
                    .single();
                
                const userName = userPreference?.username || 'Usuário desconhecido';
                
                // Adicionar à resposta
                resposta += `*${task.title}*\n`;
                resposta += `📅 Vencimento: ${formattedDate}\n`;
                resposta += `📁 Projeto: ${projectName}\n`;
                resposta += `👤 Usuário: ${userName}\n\n`;
            }
            
            // Enviar a resposta
            await message.reply(resposta);
            console.log(`[COMANDO:tarefas] Encontradas ${tasks.length} tarefas para os próximos ${minutosParametro} minutos`);
            
        } catch (error) {
            console.error('[COMANDO:tarefas] Erro ao executar comando:', error);
            await message.reply('Ocorreu um erro ao processar seu comando.');
        }
    }
}; 