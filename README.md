# Jarvis Bot - WhatsApp Bot

Um bot avançado para WhatsApp usando a biblioteca whatsapp-web.js com integração ao Supabase e API JARVIS.

## Requisitos

- Node.js 14 ou superior
- npm ou yarn
- Conta no Supabase (para o banco de dados)
- Acesso à API JARVIS

## Instalação

1. Clone este repositório:
```bash
git clone https://github.com/seu-usuario/jarvis-bot.git
cd jarvis-bot
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente:
   - Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:
   ```
   # Configuração do Supabase
   NEXT_PUBLIC_SUPABASE_URL=sua_url_do_supabase
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anon_do_supabase
   SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role_do_supabase
   
   # Configuração da API JARVIS
   JARVIS_API_URL=https://rag-jarvis-production.up.railway.app
   ```

4. Tabelas necessárias no Supabase:
   - Tabela `mensagens` (para comandos de registro):
     - `id`: UUID (chave primária)
     - `telefone`: VARCHAR
     - `nome_contato`: VARCHAR
     - `conteudo`: TEXT
     - `data_registro`: TIMESTAMP
   
   - Tabela `user_preferences` (já existente):
     - `id`: UUID (chave primária)
     - `user_id`: UUID
     - `form_of_address`: VARCHAR(50)
     - `phone_number`: VARCHAR(20)
     - `allow_notifications`: BOOLEAN (usado para autorizar o uso do bot)
     - `created_at`: TIMESTAMP
     - `updated_at`: TIMESTAMP
     - `username`: VARCHAR(255)
   
   - Tabela `tasks` (para notificações de tarefas):
     - `id`: UUID (chave primária)
     - `title`: TEXT
     - `description`: TEXT
     - `completed`: BOOLEAN
     - `due_date`: TIMESTAMP WITH TIME ZONE
     - `project_id`: UUID (referência à tabela projects)
     - `user_id`: UUID (referência à tabela users)
     - e outros campos de configuração de recorrência

   - Tabela `projects` (para informações de projeto):
     - `id`: UUID (chave primária) 
     - `name`: TEXT
     - `color`: TEXT
     - `user_id`: UUID (referência à tabela users)

## Como usar

1. Inicie o bot com o monitor de reinício automático:
```bash
npm start
```

Alternativamente, se preferir iniciar o bot sem o monitor:
```bash
npm run dev
```

2. Um QR Code será exibido no terminal. Escaneie-o com seu WhatsApp (através do WhatsApp Web) para autenticar.

3. Após conectar, o bot estará pronto para receber e responder mensagens.

## Integração com JARVIS

O bot está integrado com a API JARVIS RAG, proporcionando uma experiência de conversação avançada:

- **Verificação de Usuários**: Apenas usuários cadastrados no Supabase com `allow_notifications` ativado podem usar a API JARVIS.
- **Sessões de Conversação**: O bot mantém sessões de conversação para cada usuário, permitindo conversas contextuais.
- **Expiração de Sessões**: As sessões são automaticamente encerradas após 20 minutos de inatividade para economizar recursos.
- **Comandos Especiais**:
  - `/help` ou `ajuda`: Exibe instruções de uso
  - `/reiniciar`: Reinicia a conversa, limpando o histórico

### API JARVIS RAG

A API JARVIS RAG utiliza Retrieval-Augmented Generation para fornecer respostas precisas. A integração funciona da seguinte forma:

1. O usuário envia uma mensagem para o bot pelo WhatsApp
2. O bot envia essa mensagem para a API JARVIS junto com:
   - ID do usuário (`user_id`)
   - Nome do usuário (`user_name`)
   - Histórico de conversas (`conversation_history`)
   - Parâmetro k para controle de recuperação (`k`)
3. A API processa a consulta utilizando RAG e retorna uma resposta contextualizada
4. O bot envia essa resposta de volta para o usuário no WhatsApp

A autenticação é baseada no ID do usuário obtido da tabela `user_preferences` do Supabase.

### Fluxo de Conversação

1. Quando um usuário envia uma mensagem, o bot verifica se o número está registrado na tabela `user_preferences`.
2. Se não estiver, convida o usuário a se cadastrar na plataforma JARVIS.
3. Se estiver registrado mas com `allow_notifications` desativado, orienta o usuário a ativar as notificações.
4. Se o usuário estiver devidamente autorizado, sua mensagem é processada pela API JARVIS.
5. O bot usa o efeito "digitando..." para simular uma experiência de conversa natural.
6. A resposta da API JARVIS é enviada de volta ao usuário.

## Monitoramento de Tarefas

O bot inclui um watcher de tarefas que monitora continuamente a tabela `tasks` e envia notificações aos usuários antes do vencimento das tarefas:

### Funcionamento do TaskWatcher

1. **Verificação Periódica**: A cada 2 minutos, o sistema verifica tarefas próximas do vencimento
2. **Critérios de Notificação**:
   - Tarefas não completadas (`completed = false`)
   - Com vencimento nos próximos 30 minutos
   - Usuário permitiu notificações (`allow_notifications = true`)
3. **Formato da Notificação**:
   ```
   Olá [Pronome] [Nome], você tem a seguinte tarefa vencendo em 30 minutos:
   
   [Título da Tarefa]
   
   Essa é uma tarefa do projeto: [Nome do Projeto]
   Vencimento: [Data/Hora formatada]
   ```
4. **Controle de Duplicidade**: O sistema evita enviar múltiplas notificações para a mesma tarefa

### Ajuste de Fuso Horário

- As datas de vencimento são armazenadas em UTC no banco de dados
- O sistema converte automaticamente para o horário de Brasília (UTC-3) antes de enviar notificações
- As mensagens exibem o horário no formato local (DD/MM/YYYY HH:MM)

### Comando Manual

Para testar ou verificar manualmente as tarefas próximas do vencimento:
- **Comando**: `!tarefas [minutos]`
- **Exemplo**: `!tarefas 60` (verifica tarefas que vencem nos próximos 60 minutos)
- **Padrão**: Se nenhum parâmetro for fornecido, verifica tarefas para os próximos 30 minutos

## Sistema de Inicialização e Recuperação

O bot possui um sistema robusto de inicialização e recuperação:

- **Monitor de Processo**: O script `start.js` monitora o bot e o reinicia automaticamente em caso de falhas
- **Tratamento de Desconexões**: O bot tenta reconectar automaticamente quando desconectado do WhatsApp
- **Recuperação de Erros**: Configurações aprimoradas do Puppeteer para prevenir falhas comuns
- **Logs Detalhados**: Sistema de logs que facilita a identificação de problemas

Este sistema minimiza interrupções e mantém o bot funcionando mesmo em condições adversas.

## Funcionalidades

### Tratamento inteligente de números de telefone

O bot lida com diferentes formatos de números telefônicos brasileiros:

- Remove o código do país (55) se estiver presente
- Testa variações de formato para lidar com o dígito 9 após o DDD
- Por exemplo, para o número 5562994493774 recebido pelo WhatsApp, o bot testará:
  - 62994493774 (com o 9)
  - 6294493774 (sem o 9)
- Isso garante que os usuários sejam identificados corretamente, independentemente do formato do número.

### Comandos de Administração

Além das conversas via API JARVIS, o bot mantém os seguintes comandos:

- `!ping`: O bot responderá com "pong"
- `!registrar [mensagem]`: Registra uma mensagem no banco de dados do Supabase
- `!consultar [número]`: Consulta as últimas mensagens registradas (padrão: 5, máximo: 20)
- `!buscar [telefone]`: Busca mensagens registradas por um número de telefone específico
- `!usuarios`: Lista os últimos 10 usuários cadastrados no sistema
- `!verificar [telefone]`: Verifica se um número específico existe no banco de dados e mostra detalhes
- `!tarefas [minutos]`: Verifica tarefas que vencem nos próximos X minutos (padrão: 30)

## Arquitetura do Sistema

O sistema consiste nos seguintes componentes principais:

- **index.js**: Ponto de entrada principal e configuração do cliente WhatsApp
- **start.js**: Monitor de processo para reinício automático
- **lib/jarvis-api.js**: Cliente para comunicação com a API JARVIS
- **lib/session-manager.js**: Gerenciador de sessões de conversação
- **lib/task-watcher.js**: Monitoramento e notificação de tarefas
- **utils/database.js**: Funções utilitárias para o banco de dados
- **utils/messageHandler.js**: Processador de mensagens recebidas
- **commands/**: Comandos administrativos do bot

## Logs detalhados

O bot gera logs detalhados para facilitar o monitoramento:

- Cada mensagem recebe um ID sequencial
- Os logs mostram claramente a verificação de usuários
- Indicação de sessões criadas, usadas e expiradas
- Notificações de tarefas enviadas são registradas
- Erros específicos são registrados para facilitar a depuração

## Solução de Problemas Comuns

### Erro "Execution context was destroyed"
Este erro ocorre quando o Puppeteer perde o contexto de execução. Soluções:
- Use o comando `npm start` para iniciar o bot com o monitor de reinício automático
- Verifique se tem o Chrome/Chromium instalado no sistema
- Em sistemas com pouca memória, aumente a memória disponível ou use um swap file

### Erros com o QR Code
- Certifique-se de que o WhatsApp não está aberto em outros dispositivos
- Tente limpar a pasta `.wwebjs_auth` e reiniciar o bot

### Falhas na Conexão com a API JARVIS
- Verifique se a URL da API JARVIS está corretamente configurada no arquivo `.env`
- Teste a API separadamente para confirmar que está funcionando
- Verifique os logs para identificar o ponto específico da falha

### Notificações de Tarefas não Enviadas
- Verifique se o usuário tem `allow_notifications` configurado como `true`
- Confirme se o número de telefone está corretamente formatado
- Verifique os logs de TaskWatcher para identificar possíveis erros

## Personalização

Para personalizar o bot:

- Edite os arquivos na pasta `commands/` para adicionar mais comandos administrativos
- Modifique `lib/jarvis-api.js` para ajustar a integração com a API
- Ajuste `lib/session-manager.js` para alterar comportamentos como timeout de sessão
- Configure `lib/task-watcher.js` para alterar o intervalo de verificação ou o formato das notificações

## Observações

- A autenticação é salva localmente (na pasta .wwebjs_auth), então você não precisará escanear o QR code novamente nas próximas execuções.
- Este bot usa o Puppeteer para controlar um navegador headless, então pode consumir uma quantidade significativa de memória.
- As chaves do Supabase nunca devem ser compartilhadas publicamente.

## Licença

MIT 