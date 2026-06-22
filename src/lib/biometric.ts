// Bloqueio por biometria (Face ID / Touch ID / digital) via WebAuthn.
// É um CADEADO local sobre a sessão do Supabase: a credencial real continua
// sendo a sessão; a biometria só destrava o app na abertura.

const KEY = 'cp_biometric_v1'

interface Stored {
  email: string
  credId: string // base64url do rawId
}

function read(): Stored | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    return null
  }
}
function write(s: Stored | null) {
  if (s) localStorage.setItem(KEY, JSON.stringify(s))
  else localStorage.removeItem(KEY)
}

function b64urlToBuf(s: string): ArrayBuffer {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr.buffer
}
function bufToB64url(b: ArrayBuffer): string {
  const bytes = new Uint8Array(b)
  let bin = ''
  for (const x of bytes) bin += String.fromCharCode(x)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function randomBytes(n = 32): ArrayBuffer {
  return crypto.getRandomValues(new Uint8Array(n)).buffer as ArrayBuffer
}

/** O dispositivo tem autenticador de plataforma (Face ID/Touch ID/digital)? */
export async function biometricSupported(): Promise<boolean> {
  if (typeof window === 'undefined' || !('PublicKeyCredential' in window)) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

/** Biometria já configurada para este e-mail neste dispositivo? */
export function biometricEnabledFor(email: string | undefined | null): boolean {
  const s = read()
  return !!s && s.email === (email || '').toLowerCase()
}

/** Registra a credencial de plataforma (pede a biometria uma vez). */
export async function enableBiometric(email: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await biometricSupported())) return { ok: false, error: 'Biometria indisponível neste dispositivo.' }
  const lower = (email || '').toLowerCase()
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(),
        rp: { name: 'ContratoPay' },
        user: { id: randomBytes(16), name: lower || 'cliente', displayName: lower || 'Cliente' },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null
    if (!cred) return { ok: false, error: 'Cancelado.' }
    write({ email: lower, credId: bufToB64url(cred.rawId) })
    _unlocked = true
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'Não foi possível ativar.' }
  }
}

export function disableBiometric() {
  write(null)
  _unlocked = true
}

// Estado de destravamento (em memória; volta a travar a cada abertura/reload).
let _unlocked = false
export function isUnlocked(): boolean {
  return _unlocked
}
export function markUnlocked() {
  _unlocked = true
}

/** Pede a biometria para destravar (assertion WebAuthn). */
export async function unlockBiometric(): Promise<{ ok: boolean; error?: string }> {
  const s = read()
  if (!s) return { ok: false, error: 'Biometria não configurada.' }
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(),
        allowCredentials: [{ id: b64urlToBuf(s.credId), type: 'public-key' }],
        userVerification: 'required',
        timeout: 60000,
      },
    })
    if (!assertion) return { ok: false, error: 'Cancelado.' }
    _unlocked = true
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'Falhou.' }
  }
}
