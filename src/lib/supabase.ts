// Cliente Supabase — usado quando as variáveis de ambiente estiverem
// configuradas (.env). Enquanto vazias, o app permanece em modo LOCAL.
//
// Próximo passo de produção: criar um repo (supabaseRepo) com as MESMAS funções
// de src/lib/repo.ts, porém lendo/gravando via este cliente. A engine de cálculo
// (src/lib/finance.ts) é a mesma nos dois modos.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!)
  : null

/**
 * Interruptor do backend. O modo Supabase só liga com VITE_BACKEND=supabase
 * E as chaves configuradas — assim a produção segue em modo local até ligarmos
 * de propósito (sem risco de quebrar enquanto o schema/usuários não existem).
 */
export const useSupabase =
  isSupabaseConfigured && import.meta.env.VITE_BACKEND === 'supabase'
