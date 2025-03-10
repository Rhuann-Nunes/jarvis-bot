/**
 * Task Watcher - Monitoramento de tarefas próximas do vencimento
 * Notifica usuários sobre tarefas que vencerão em breve
 */
const { supabase } = require('../config/supabase');

class TaskWatcher {
  constructor(whatsappClient) {
    this.client = whatsappClient;
    this.watcherInterval = null;
    this.checkIntervalMinutes = 2; // Verificar a cada 2 minutos
    this.notificationWindowMinutes = 30; // Notificar 30 minutos antes
    this.alreadyNotifiedTasks = new Set(); // Evitar notificações duplicadas
    
    // Fuso horário de Brasília (-3 horas de UTC)
    this.timezoneOffset = -3 * 60 * 60 * 1000;
  }
  
  /**
   * Inicia o monitoramento de tarefas
   */
  start() {
    console.log('[TASK_WATCHER] Iniciando monitoramento de tarefas');
    
    // Executa imediatamente na inicialização
    this.checkUpcomingTasks();
    
    // Configura o intervalo de verificação
    this.watcherInterval = setInterval(() => {
      this.checkUpcomingTasks();
    }, this.checkIntervalMinutes * 60 * 1000);
  }
  
  /**
   * Para o monitoramento de tarefas
   */
  stop() {
    console.log('[TASK_WATCHER] Parando monitoramento de tarefas');
    if (this.watcherInterval) {
      clearInterval(this.watcherInterval);
      this.watcherInterval = null;
    }
  }
  
  /**
   * Converte um timestamp UTC para o horário de Brasília
   * @param {Date|string} utcDate - Data em UTC
   * @returns {Date} - Data convertida para horário de Brasília
   */
  convertToBrasiliaTime(utcDate) {
    const date = new Date(utcDate);
    return new Date(date.getTime() + this.timezoneOffset);
  }
  
  /**
   * Formata uma data para exibição
   * @param {Date} date - Data a ser formatada
   * @returns {string} - Data formatada (DD/MM/YYYY HH:MM)
   */
  formatDate(date) {
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  /**
   * Verifica se há tarefas próximas do vencimento
   */
  async checkUpcomingTasks() {
    try {
      console.log('[TASK_WATCHER] Verificando tarefas próximas do vencimento...');
      
      // Calcular o intervalo de tempo para notificação
      const now = new Date();
      const futureTime = new Date(now.getTime() + (this.notificationWindowMinutes * 60 * 1000));
      
      // Ajustar para UTC pois o banco armazena em UTC
      const nowUTC = new Date(now.getTime() - this.timezoneOffset).toISOString();
      const futureTimeUTC = new Date(futureTime.getTime() - this.timezoneOffset).toISOString();
      
      // Buscar tarefas que vencem em breve (entre agora e 30 minutos no futuro)
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
        .lt('due_date', futureTimeUTC);
      
      if (error) {
        console.error('[TASK_WATCHER] Erro ao buscar tarefas:', error);
        return;
      }
      
      console.log(`[TASK_WATCHER] Encontradas ${tasks.length} tarefas para notificar`);
      
      // Processar cada tarefa
      for (const task of tasks) {
        // Verificar se já notificamos sobre esta tarefa
        if (this.alreadyNotifiedTasks.has(task.id)) {
          continue;
        }
        
        // Buscar dados do usuário
        const { data: userPreference, error: userError } = await supabase
          .from('user_preferences')
          .select('form_of_address, phone_number, allow_notifications, username')
          .eq('user_id', task.user_id)
          .single();
        
        if (userError || !userPreference) {
          console.error(`[TASK_WATCHER] Erro ao buscar preferências do usuário ${task.user_id}:`, userError);
          continue;
        }
        
        // Verificar se o usuário permite notificações
        if (!userPreference.allow_notifications) {
          console.log(`[TASK_WATCHER] Usuário ${task.user_id} não permite notificações`);
          continue;
        }
        
        // Buscar dados do projeto
        let projectName = "Sem projeto";
        if (task.project_id) {
          const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('name')
            .eq('id', task.project_id)
            .single();
          
          if (!projectError && project) {
            projectName = project.name;
          }
        }
        
        // Converter data de vencimento para horário de Brasília
        const dueDate = this.convertToBrasiliaTime(task.due_date);
        const formattedDueDate = this.formatDate(dueDate);
        
        // Montar mensagem de notificação
        const message = `
Olá ${userPreference.form_of_address || ''} ${userPreference.username || 'usuário'}, você tem a seguinte tarefa vencendo em ${this.notificationWindowMinutes} minutos:

*${task.title}*

Essa é uma tarefa do projeto: *${projectName}*
Vencimento: ${formattedDueDate}
        `.trim();
        
        // Enviar notificação via WhatsApp
        await this.sendNotification(userPreference.phone_number, message, task.id);
        
        // Marcar como notificada
        this.alreadyNotifiedTasks.add(task.id);
      }
      
      // Limpar tarefas antigas do conjunto de notificadas (a cada 24h)
      if (this.alreadyNotifiedTasks.size > 1000) {
        console.log('[TASK_WATCHER] Limpando cache de tarefas notificadas');
        this.alreadyNotifiedTasks.clear();
      }
      
    } catch (error) {
      console.error('[TASK_WATCHER] Erro ao verificar tarefas:', error);
    }
  }
  
  /**
   * Envia uma notificação para o usuário via WhatsApp
   * @param {string} phoneNumber - Número de telefone (com DDD, sem código do país)
   * @param {string} message - Mensagem a ser enviada
   * @param {string} taskId - ID da tarefa (para log)
   */
  async sendNotification(phoneNumber, message, taskId) {
    try {
      if (!phoneNumber) {
        console.error(`[TASK_WATCHER] Telefone não encontrado para notificação da tarefa ${taskId}`);
        return;
      }
      
      // Formatar número para o WhatsApp
      let formattedNumber = phoneNumber.replace(/\D/g, ''); // Remove não-dígitos
      if (!formattedNumber.startsWith('55')) {
        formattedNumber = '55' + formattedNumber;
      }

      // Garantir que o número está no formato correto para o WhatsApp
      // O WhatsApp espera o número sem o 9 após o DDD para números brasileiros
      if (formattedNumber.length === 13 && formattedNumber.startsWith('55')) {
        const ddd = formattedNumber.substring(2, 4);
        const numero = formattedNumber.substring(5); // Remove o 9
        formattedNumber = `55${ddd}${numero}`;
      }
      
      // Número completo no formato do WhatsApp
      const whatsappNumber = `${formattedNumber}@c.us`;
      
      console.log(`[TASK_WATCHER] Enviando notificação para ${whatsappNumber} sobre tarefa ${taskId}`);
      
      // Tentar enviar a mensagem
      if (this.client && typeof this.client.sendMessage === 'function') {
        await this.client.sendMessage(whatsappNumber, message);
        console.log(`[TASK_WATCHER] Notificação enviada com sucesso para ${whatsappNumber}`);
      } else {
        console.error('[TASK_WATCHER] Cliente WhatsApp não disponível para envio de notificações');
      }
    } catch (error) {
      console.error(`[TASK_WATCHER] Erro ao enviar notificação para ${phoneNumber}:`, error);
    }
  }
}

module.exports = TaskWatcher; 