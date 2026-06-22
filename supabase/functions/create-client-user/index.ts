// ============================================================================
// Edge Function: create-client-user
// Cria (ou atualiza a senha de) um usuário de login para o CLIENTE, a partir do
// cadastro no app. Só o admin (app_admins) pode chamar. Usa a service role key
// (disponível só no servidor) — por isso NÃO fica no app do navegador.
//
// Deploy (uma vez):
//   supabase login
//   supabase link --project-ref zdlmdjafjaqcolagptlf
//   supabase functions deploy create-client-user
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'método não permitido' })

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // 1) Identifica quem está chamando (pelo token do app) e confirma que é admin.
  const authHeader = req.headers.get('Authorization') ?? ''
  const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
  const {
    data: { user },
  } = await caller.auth.getUser()
  if (!user?.email) return json(401, { error: 'Não autenticado.' })

  const { data: admin } = await caller
    .from('app_admins')
    .select('email')
    .ilike('email', user.email)
    .maybeSingle()
  if (!admin) return json(403, { error: 'Apenas o vendedor (admin) pode criar acessos.' })

  // 2) Cria/atualiza o usuário do cliente com a service role.
  let payload: { email?: string; password?: string }
  try {
    payload = await req.json()
  } catch {
    return json(400, { error: 'Corpo inválido.' })
  }
  const email = (payload.email ?? '').trim().toLowerCase()
  const password = payload.password ?? ''
  if (!email || password.length < 6) {
    return json(400, { error: 'Informe e-mail e senha (mín. 6 caracteres).' })
  }

  const adminApi = createClient(url, service)

  // Se já existe um usuário com este e-mail, apenas redefine a senha.
  const { data: list } = await adminApi.auth.admin.listUsers()
  const existing = list?.users?.find((u) => (u.email ?? '').toLowerCase() === email)
  if (existing) {
    const { error } = await adminApi.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    })
    if (error) return json(400, { error: error.message })
    return json(200, { ok: true, updated: true })
  }

  const { error } = await adminApi.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) return json(400, { error: error.message })
  return json(200, { ok: true, created: true })
})
