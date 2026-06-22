-- ============================================================================
-- ContratoPay — Schema do Supabase (Postgres)
--
-- Cole TODO este arquivo no SQL Editor do Supabase e clique em RUN.
-- IDs em TEXT (compatível com os IDs gerados pelo app). Valores monetários em
-- numeric(14,2). Segurança por e-mail (RLS): o admin (app_admins) vê tudo; cada
-- cliente só vê o contrato cujo e-mail do cliente é igual ao e-mail do login.
-- ============================================================================

create extension if not exists pgcrypto;

-- Administradores (quem enxerga todos os contratos) --------------------------
create table if not exists app_admins (
  email text primary key
);
insert into app_admins (email) values ('fernandogutemberggomes@gmail.com')
  on conflict (email) do nothing;

create or replace function current_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')); $$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_admins a where lower(a.email) = current_email());
$$;

-- Clientes -------------------------------------------------------------------
create table if not exists clients (
  id text primary key,
  name text not null,
  document text default '',
  phone text default '',
  email text default '',
  address text default '',
  status text not null default 'ativo',
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Contratos ------------------------------------------------------------------
create table if not exists contracts (
  id text primary key,
  client_id text not null references clients (id) on delete cascade,
  title text not null,
  total_value numeric(14,2) not null,
  down_payment_value numeric(14,2) not null default 0,
  down_payment_installments int not null default 0,
  down_payment_start_date date,
  financed_value numeric(14,2) not null,
  financing_installments int not null,
  financing_start_date date not null,
  first_installment_due_date date,
  base_installment_value numeric(14,2) not null,
  correction_type text not null default 'ipca_anual',
  correction_base_date date not null,
  correction_frequency_months int not null default 12,
  forecast_annual_ipca numeric(6,4) not null default 0.05,
  status text not null default 'ativo',
  internal_notes text default '',
  client_notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Pagamentos -----------------------------------------------------------------
create table if not exists payments (
  id text primary key,
  contract_id text not null references contracts (id) on delete cascade,
  installment_type text not null,
  installment_number int not null,
  payment_date date not null,
  amount numeric(14,2) not null default 0,
  amortization_amount numeric(14,2) not null default 0,
  payment_type text not null default 'pix',
  pix_key_id text,
  receipt_url text,
  status text not null default 'em_aberto',
  notes text default '',
  created_by text,
  created_at timestamptz not null default now(),
  unique (contract_id, installment_type, installment_number)
);

-- Correções IPCA oficiais ----------------------------------------------------
create table if not exists ipca_corrections (
  id text primary key,
  contract_id text not null references contracts (id) on delete cascade,
  index int not null,
  correction_date date not null,
  ipca_percentage numeric(8,6) not null,
  notes text default '',
  created_at timestamptz not null default now(),
  unique (contract_id, index)
);

-- Chaves Pix (histórico) -----------------------------------------------------
create table if not exists pix_keys (
  id text primary key,
  contract_id text not null references contracts (id) on delete cascade,
  pix_key text default '',
  receiver_name text default '',
  bank_name text default '',
  active_from date not null,
  active_until date,
  status text not null default 'ativa',
  created_at timestamptz not null default now()
);

-- Auditoria ------------------------------------------------------------------
create table if not exists audit_logs (
  id text primary key,
  user_id text,
  contract_id text references contracts (id) on delete set null,
  action text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_contracts_client on contracts (client_id);
create index if not exists idx_payments_contract on payments (contract_id);
create index if not exists idx_corrections_contract on ipca_corrections (contract_id);
create index if not exists idx_pix_contract on pix_keys (contract_id);

-- ============================================================================
-- Segurança (RLS) — por e-mail
-- ============================================================================
alter table app_admins enable row level security;
alter table clients enable row level security;
alter table contracts enable row level security;
alter table payments enable row level security;
alter table ipca_corrections enable row level security;
alter table pix_keys enable row level security;
alter table audit_logs enable row level security;

drop policy if exists app_admins_self on app_admins;
create policy app_admins_self on app_admins for select using (lower(email) = current_email());

create or replace function owns_contract(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from contracts ct
    join clients cl on cl.id = ct.client_id
    where ct.id = c and lower(cl.email) = current_email()
  );
$$;

drop policy if exists clients_admin on clients;
drop policy if exists clients_read on clients;
create policy clients_admin on clients for all using (is_admin()) with check (is_admin());
create policy clients_read on clients for select using (lower(email) = current_email());

drop policy if exists contracts_admin on contracts;
drop policy if exists contracts_read on contracts;
create policy contracts_admin on contracts for all using (is_admin()) with check (is_admin());
create policy contracts_read on contracts for select using (
  client_id in (select id from clients where lower(email) = current_email())
);

drop policy if exists payments_admin on payments;
drop policy if exists payments_read on payments;
drop policy if exists payments_client_insert on payments;
drop policy if exists payments_client_update on payments;
drop policy if exists payments_client_delete on payments;
create policy payments_admin on payments for all using (is_admin()) with check (is_admin());
create policy payments_read on payments for select using (owns_contract(contract_id));
-- Cliente só INSERE comprovante/pedido PENDENTE e SEM valor (inerte no cálculo);
-- impede inserir amount/amortização arbitrários mesmo com status pendente.
create policy payments_client_insert on payments for insert
  with check (
    owns_contract(contract_id) and status = 'comprovante_enviado'
    and coalesce(amount, 0) = 0 and coalesce(amortization_amount, 0) = 0
  );
-- Cliente ATUALIZA (troca) o próprio comprovante PENDENTE — continua pendente e
-- sem valor; nunca pode marcar como pago nem mexer em pagamento já validado.
create policy payments_client_update on payments for update
  using (owns_contract(contract_id) and status = 'comprovante_enviado')
  with check (
    owns_contract(contract_id) and status = 'comprovante_enviado'
    and coalesce(amount, 0) = 0 and coalesce(amortization_amount, 0) = 0
  );
-- Cliente EXCLUI o próprio comprovante/pedido PENDENTE (jamais um pago).
create policy payments_client_delete on payments for delete
  using (owns_contract(contract_id) and status = 'comprovante_enviado');

drop policy if exists ipca_admin on ipca_corrections;
drop policy if exists ipca_read on ipca_corrections;
create policy ipca_admin on ipca_corrections for all using (is_admin()) with check (is_admin());
create policy ipca_read on ipca_corrections for select using (owns_contract(contract_id));

drop policy if exists pix_admin on pix_keys;
drop policy if exists pix_read on pix_keys;
create policy pix_admin on pix_keys for all using (is_admin()) with check (is_admin());
create policy pix_read on pix_keys for select using (owns_contract(contract_id));

drop policy if exists audit_admin on audit_logs;
create policy audit_admin on audit_logs for all using (is_admin()) with check (is_admin());

-- ===========================================================================
-- Web Push — assinaturas de notificação (uma por dispositivo/endpoint).
-- ===========================================================================
create table if not exists push_subscriptions (
  endpoint text primary key,
  user_email text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;

-- Cada usuário gerencia só a própria assinatura (pelo e-mail logado).
drop policy if exists push_self on push_subscriptions;
create policy push_self on push_subscriptions for all
  using (lower(user_email) = current_email())
  with check (lower(user_email) = current_email());

-- Admin pode ver/limpar todas (o envio em si é feito pela service role).
drop policy if exists push_admin on push_subscriptions;
create policy push_admin on push_subscriptions for all using (is_admin()) with check (is_admin());

-- ===========================================================================
-- Log de notificações (rastreamento de entrega/clique).
-- ===========================================================================
create table if not exists notification_log (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  title text,
  body text,
  url text,
  created_by text,
  sent_at timestamptz not null default now(),
  delivered_at timestamptz,
  clicked_at timestamptz
);
alter table notification_log enable row level security;
-- Só o admin lê (escrita é via service role nas Edge Functions).
drop policy if exists notiflog_admin on notification_log;
create policy notiflog_admin on notification_log for all using (is_admin()) with check (is_admin());
