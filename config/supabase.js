const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Verificar se as variáveis de ambiente estão configuradas
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.error('As variáveis de ambiente do Supabase não estão configuradas');
  process.exit(1);
}

// Criar o cliente do Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Cliente do Supabase com a chave de serviço (para operações privilegiadas)
const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY 
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

module.exports = { supabase, supabaseAdmin }; 