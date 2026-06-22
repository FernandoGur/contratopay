import { useSyncExternalStore } from 'react'
import { getCurrentUser, getVersion, isReady, subscribe } from './repo'

/** Re-renderiza quando o banco muda. Retorna um "tick" de versão que muda a
 *  cada persist() — necessário porque o `db` é mutado no lugar (mesma ref). */
export function useDb() {
  return useSyncExternalStore(subscribe, getVersion, getVersion)
}

export function useCurrentUser() {
  return useSyncExternalStore(subscribe, getCurrentUser, getCurrentUser)
}

/** True quando o app está pronto (no Supabase, após hidratar a sessão). */
export function useReady() {
  return useSyncExternalStore(subscribe, isReady, isReady)
}
