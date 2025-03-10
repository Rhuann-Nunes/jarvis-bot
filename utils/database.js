const { supabase, supabaseAdmin } = require('../config/supabase');

/**
 * Funções utilitárias para operações no banco de dados
 */
const dbUtils = {
    /**
     * Registra uma mensagem no banco de dados
     * @param {Object} data - Dados da mensagem
     * @param {string} data.telefone - Número de telefone
     * @param {string} data.nome_contato - Nome do contato
     * @param {string} data.conteudo - Conteúdo da mensagem
     * @returns {Promise<Object>} - Objeto com data e error
     */
    registrarMensagem: async (data) => {
        return await supabase
            .from('mensagens')
            .insert([
                { 
                    ...data,
                    data_registro: new Date().toISOString()
                }
            ]);
    },

    /**
     * Consulta as últimas mensagens registradas
     * @param {number} limit - Número máximo de mensagens a retornar
     * @returns {Promise<Object>} - Objeto com data e error
     */
    consultarMensagens: async (limit = 5) => {
        return await supabase
            .from('mensagens')
            .select('*')
            .order('data_registro', { ascending: false })
            .limit(limit);
    },

    /**
     * Consulta mensagens por número de telefone
     * @param {string} telefone - Número de telefone para filtrar
     * @param {number} limit - Número máximo de mensagens a retornar
     * @returns {Promise<Object>} - Objeto com data e error
     */
    consultarMensagensPorTelefone: async (telefone, limit = 5) => {
        return await supabase
            .from('mensagens')
            .select('*')
            .eq('telefone', telefone)
            .order('data_registro', { ascending: false })
            .limit(limit);
    },

    /**
     * Deleta uma mensagem por ID
     * @param {string} id - ID da mensagem
     * @returns {Promise<Object>} - Objeto com data e error
     */
    deletarMensagem: async (id) => {
        return await supabaseAdmin
            .from('mensagens')
            .delete()
            .eq('id', id);
    },

    /**
     * Verifica se um número de telefone existe na tabela user_preferences
     * @param {string} numeroCompleto - Número completo com código do país (ex: 5562994493774)
     * @returns {Promise<Object>} - Objeto com { exists: boolean, username: string|null, error: object|null }
     */
    verificarUsuario: async (numeroCompleto) => {
        // Remove o código do país (+55) se estiver presente
        let numeroSemPais = numeroCompleto.replace(/^55/, '');
        
        // Gerar possíveis formatos de números telefônicos brasileiros
        // Para lidar com a variação do dígito 9 após o DDD
        const possiveisFormatos = [];
        
        // Adiciona o formato original
        possiveisFormatos.push(numeroSemPais);
        
        // Se o número tem 10 dígitos (DDD + 8 dígitos), pode ser que precise adicionar o 9
        if (numeroSemPais.length === 10) {
            // Adiciona o 9 após o DDD (posição 2)
            const comNove = numeroSemPais.substring(0, 2) + '9' + numeroSemPais.substring(2);
            possiveisFormatos.push(comNove);
            console.log(`[FORMATO] Adicionando possível formato com dígito 9: ${comNove}`);
        }
        
        // Se o número tem 11 dígitos (DDD + 9 + 8 dígitos), pode ser que o 9 precise ser removido
        if (numeroSemPais.length === 11) {
            // Remove o possível 9 após o DDD (posição 2)
            const semNove = numeroSemPais.substring(0, 2) + numeroSemPais.substring(3);
            possiveisFormatos.push(semNove);
            console.log(`[FORMATO] Adicionando possível formato sem dígito 9: ${semNove}`);
        }
        
        console.log(`[CONSULTA] Verificando número ${numeroSemPais} e variações na tabela user_preferences...`);
        console.log(`[CONSULTA] Possíveis formatos: ${possiveisFormatos.join(', ')}`);
        
        try {
            // Procurar em cada formato possível
            for (const formato of possiveisFormatos) {
                console.log(`[CONSULTA] Tentando formato: ${formato}`);
                
                // Garantir que não estamos usando cache - forçar nova consulta
                const { data, error } = await supabase
                    .from('user_preferences')
                    .select('username, phone_number, user_id, allow_notifications')
                    .eq('phone_number', formato)
                    .maybeSingle();

                if (error) {
                    console.error(`[DB_ERRO] Falha na consulta para número ${formato}:`, error);
                    continue; // Tentar o próximo formato
                }

                // Se encontrou, retorna imediatamente
                if (data) {
                    console.log(`[DB_RESULTADO] Número ${formato}: Encontrado!`);
                    console.log(`[DB_RESULTADO] Equivale ao número ${numeroCompleto} do WhatsApp`);
                    return {
                        exists: true,
                        username: data.username || null,
                        userId: data.user_id,
                        allowNotifications: data.allow_notifications || false,
                        error: null,
                        formatoEncontrado: formato
                    };
                } else {
                    console.log(`[DB_RESULTADO] Número ${formato}: Não encontrado`);
                }
            }
            
            // Se chegou aqui, não encontrou em nenhum formato
            console.log(`[DB_RESULTADO] Número não encontrado em nenhum formato testado`);
            return {
                exists: false,
                username: null,
                userId: null,
                allowNotifications: false,
                error: null
            };
            
        } catch (error) {
            console.error(`[DB_EXCEÇÃO] Erro ao consultar número ${numeroSemPais}:`, error);
            return { 
                exists: false, 
                username: null, 
                userId: null,
                allowNotifications: false,
                error 
            };
        }
    },

    /**
     * Verifica se um usuário existe e tem permissão para usar o JARVIS
     * @param {string} phoneNumber - Número de telefone (formato internacional ou local)
     * @returns {Promise<{userId: string, userName: string, allowNotifications: boolean} | null>}
     */
    getUserByPhoneNumber: async (phoneNumber) => {
        try {
            console.log(`[JARVIS_AUTH] Buscando usuário com número: ${phoneNumber}`);
            
            // Usar a função verificarUsuario que já lida com diferentes formatos
            const { exists, username, userId, allowNotifications, error } = await dbUtils.verificarUsuario(phoneNumber);
            
            if (!exists || error) {
                console.log(`[JARVIS_AUTH] Usuário não encontrado ou não autorizado: ${phoneNumber}`);
                return null;
            }
            
            return {
                userId: userId,
                userName: username || 'Usuário',
                allowNotifications: allowNotifications
            };
        } catch (error) {
            console.error('[JARVIS_AUTH] Erro ao buscar usuário:', error);
            return null;
        }
    }
};

module.exports = dbUtils; 