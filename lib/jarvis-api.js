/**
 * Cliente para comunicação com a API do JARVIS
 * Gerencia sessões de conversas e interações com a API
 */
const fetch = require('node-fetch');

/**
 * Definição de formato de mensagem Jarvis
 * @typedef {Object} JarvisMessage
 * @property {'user'|'assistant'} role - Papel da mensagem (usuário ou assistente)
 * @property {string} content - Conteúdo da mensagem
 */

class JarvisClient {
  /**
   * Cria uma nova instância do cliente JARVIS
   * @param {string} userId - ID do usuário no Supabase
   * @param {string} userName - Nome do usuário
   */
  constructor(userId, userName) {
    this.userId = userId;
    this.userName = userName;
    this.conversationHistory = [];
    this.lastActivityTime = Date.now();
    this.apiUrl = process.env.JARVIS_API_URL || 'https://rag-jarvis-production.up.railway.app';
    this.isInitialized = false;
  }

  /**
   * Carrega os dados do usuário da API
   * @returns {Promise<boolean>}
   */
  async loadUserData() {
    try {
      // Atualizar o timestamp de última atividade
      this.lastActivityTime = Date.now();

      console.log(`[JARVIS] Carregando dados do usuário ${this.userId}`);
      
      // Fazer chamada à API para inicializar os dados do usuário (mesma implementação do sistema web)
      const response = await fetch(`${this.apiUrl}/api/load-user-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: this.userId,
          user_name: this.userName
        })
      });
      
      if (!response.ok) {
        throw new Error(`Erro ao carregar dados do usuário: ${response.status}`);
      }
      
      // Recebemos resultado, mas não precisamos usar os dados retornados
      await response.json();
      
      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error(`[JARVIS] Erro ao carregar dados do usuário ${this.userId}:`, error.message);
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Envia uma mensagem para a API do JARVIS e recebe a resposta
   * @param {string} message - Mensagem enviada pelo usuário
   * @param {number} k - Parâmetro k para consulta (padrão: 100)
   * @returns {Promise<string>} - Resposta do JARVIS
   */
  async sendMessage(message, k = 100) {
    try {
      // Atualizar o timestamp de última atividade
      this.lastActivityTime = Date.now();

      console.log(`[JARVIS] Enviando mensagem para API: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);
      
      // Enviar requisição para a API JARVIS usando fetch
      const response = await fetch(`${this.apiUrl}/api/user-query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: this.userId,
          user_name: this.userName,
          query: message,
          conversation_history: this.conversationHistory,
          k: k
        })
      });

      if (!response.ok) {
        throw new Error(`Erro na API: ${response.status}`);
      }

      const result = await response.json();
      
      if (!result || !result.answer) {
        throw new Error('Resposta inválida da API');
      }

      const jarvisResponse = result.answer;
      
      // Atualizar o histórico APÓS receber a resposta (mesmo comportamento do sistema web)
      this.conversationHistory.push(
        { role: 'user', content: message },
        { role: 'assistant', content: jarvisResponse }
      );

      // Limitar o tamanho do histórico para economizar memória
      if (this.conversationHistory.length > 20) {
        // Manter apenas as últimas 20 mensagens
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      return jarvisResponse;
    } catch (error) {
      console.error(`[JARVIS] Erro ao processar mensagem para ${this.userId}:`, error.message);
      
      // Em caso de erro, retornar uma mensagem amigável
      return "Desculpe, estou tendo dificuldades para processar sua solicitação no momento. Por favor, tente novamente em alguns instantes.";
    }
  }

  /**
   * Método para buscar diretamente nos dados do usuário sem gerar uma resposta contextualizada
   * @param {string} query - A consulta para busca
   * @param {number} k - Parâmetro k para controle de recuperação
   * @returns {Promise<any>} - Resultados da busca
   */
  async searchData(query, k = 100) {
    try {
      // Atualizar o timestamp de última atividade
      this.lastActivityTime = Date.now();

      const response = await fetch(`${this.apiUrl}/api/user-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: this.userId,
          user_name: this.userName,
          query: query,
          k: k
        })
      });
      
      if (!response.ok) {
        throw new Error(`Erro ao buscar dados: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`[JARVIS] Erro ao buscar dados para ${this.userId}:`, error.message);
      throw new Error('Não foi possível buscar os dados solicitados. Por favor, tente novamente mais tarde.');
    }
  }

  /**
   * Verifica se a sessão está inativa por mais de 20 minutos
   * @returns {boolean} - True se a sessão expirou, False caso contrário
   */
  isSessionExpired() {
    const inactivityThreshold = 20 * 60 * 1000; // 20 minutos em milissegundos
    const currentTime = Date.now();
    const timeSinceLastActivity = currentTime - this.lastActivityTime;
    
    return timeSinceLastActivity > inactivityThreshold;
  }

  /**
   * Reinicia a conversa, limpando o histórico
   */
  resetConversation() {
    this.conversationHistory = [];
    this.lastActivityTime = Date.now();
    console.log(`[JARVIS] Conversa reiniciada para usuário ${this.userId}`);
  }

  /**
   * Obtém o histórico de conversação atual
   * @returns {JarvisMessage[]} - Cópia do histórico de conversação
   */
  getConversationHistory() {
    return [...this.conversationHistory];
  }
}

// Exportar a classe
module.exports = { JarvisClient }; 