import { useSyncExternalStore } from 'react'
import { getCurrentUser, getDb, isReady, subscribe } from './repo'

/** Re-renderiza quando o banco local muda. Retorna um "tick" de versão. */
export function useDb() {
  return useSyncExternalStore(subscribe, getDb, getDb)
}

export function useCurrentUser() {
  return useSyncExternalStore(subscribe, getCurrentUser, getCurrentUser)
}

/** True quando o app está pronto (no Supabase, após hidratar a sessão). */
export function useReady() {
  return useSyncExternalStore(subscribe, isReady, isReady)
}
