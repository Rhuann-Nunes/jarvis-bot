/**
 * Gerenciador de sessões para o cliente JARVIS
 * Controla as sessões ativas e limpa sessões expiradas
 */
const { JarvisClient } = require('./jarvis-api');

class SessionManager {
    constructor() {
        this.sessions = new Map();
        this.lastSessionId = 0;
        
        // Iniciar o limpador de sessões a cada minuto
        this.cleanupInterval = setInterval(() => this.cleanupExpiredSessions(), 60 * 1000);
        
        console.log('[SESSION_MANAGER] Inicializado gerenciador de sessões');
    }
    
    /**
     * Obtém ou cria uma sessão para um usuário
     * @param {string} userId - ID do usuário
     * @param {string} userName - Nome do usuário
     * @returns {JarvisClient} - Cliente JARVIS para o usuário
     */
    getSession(userId, userName) {
        // Verificar se já existe uma sessão para o usuário
        if (this.sessions.has(userId)) {
            const session = this.sessions.get(userId);
            console.log(`[SESSION_MANAGER] Sessão existente encontrada para ${userId}`);
            return session;
        }
        
        // Criar nova sessão
        console.log(`[SESSION_MANAGER] Criando nova sessão para ${userId}`);
        const session = new JarvisClient(userId, userName);
        this.sessions.set(userId, session);
        
        return session;
    }
    
    /**
     * Inicializa uma sessão, carregando os dados do usuário
     * @param {string} userId - ID do usuário
     * @param {string} userName - Nome do usuário
     * @returns {Promise<JarvisClient>} - Cliente JARVIS inicializado
     */
    async initSession(userId, userName) {
        const session = this.getSession(userId, userName);
        
        try {
            // Somente carregar dados se a sessão não estiver inicializada
            if (!session.isInitialized) {
                await session.loadUserData();
            }
            return session;
        } catch (error) {
            console.error(`[SESSION_MANAGER] Erro ao inicializar sessão para ${userId}:`, error.message);
            
            // Remover a sessão com erro para tentar novamente na próxima vez
            this.sessions.delete(userId);
            throw error;
        }
    }
    
    /**
     * Remove uma sessão específica
     * @param {string} userId - ID do usuário
     */
    removeSession(userId) {
        if (this.sessions.has(userId)) {
            console.log(`[SESSION_MANAGER] Removendo sessão para ${userId}`);
            this.sessions.delete(userId);
        }
    }
    
    /**
     * Limpa as sessões expiradas (inativas por mais de 20 minutos)
     */
    cleanupExpiredSessions() {
        console.log(`[SESSION_MANAGER] Verificando sessões expiradas. Total ativo: ${this.sessions.size}`);
        
        for (const [userId, session] of this.sessions.entries()) {
            if (session.isSessionExpired()) {
                console.log(`[SESSION_MANAGER] Sessão expirada para ${userId}. Último uso: ${new Date(session.lastActivityTime).toISOString()}`);
                this.sessions.delete(userId);
            }
        }
        
        console.log(`[SESSION_MANAGER] Verificação concluída. Total de sessões ativas: ${this.sessions.size}`);
    }
    
    /**
     * Reinicia uma sessão específica
     * @param {string} userId - ID do usuário
     * @param {string} userName - Nome do usuário
     * @returns {JarvisClient} - Cliente JARVIS com conversa reiniciada
     */
    resetSession(userId, userName) {
        this.removeSession(userId);
        return this.getSession(userId, userName);
    }
    
    /**
     * Finaliza o gerenciador, limpando o intervalo de verificação
     */
    shutdown() {
        clearInterval(this.cleanupInterval);
        console.log('[SESSION_MANAGER] Gerenciador de sessões finalizado');
    }
}

// Instância singleton
const sessionManager = new SessionManager();

module.exports = sessionManager; 