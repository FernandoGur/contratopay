import { useSyncExternalStore } from 'react'
import { getCurrentUser, getDb, subscribe } from './repo'

/** Re-renderiza quando o banco local muda. Retorna um "tick" de versão. */
export function useDb() {
  return useSyncExternalStore(subscribe, getDb, getDb)
}

export function useCurrentUser() {
  return useSyncExternalStore(subscribe, getCurrentUser, getCurrentUser)
}
