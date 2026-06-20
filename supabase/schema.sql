-- ============================================================================
-- Recebimentos — Schema do Supabase (Postgres)
--
-- Cole este arquivo no SQL Editor do Supabase e execute.
-- Cria todas as tabelas, índices e políticas de segurança (RLS) para que cada
-- cliente só enxergue o próprio contrato, e o vendedor (admin) enxergue tudo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Perfis (estende auth.users do Supabase Auth)
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  role text not null default 'cliente' check (role in ('admin', 'cliente')),
  client_id uuid,
  created_at timestamptz not null default now()
);

-- Helper: o usuário atual é admin?
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------------
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text default '',
  phone text default '',
  email text default '',
  address text default '',
  status text not null default 'ativo'
    check (status in ('ativo', 'inadimplente', 'quitado', 'bloqueado')),
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Contratos
-- ---------------------------------------------------------------------------
create table if not exists contracts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  title text not null,
  total_value numeric(14, 2) not null,
  down_payment_value numeric(14, 2) not null default 0,
  down_payment_installments int not null default 0,
  down_payment_start_date date,
  financed_value numeric(14, 2) not null,
  financing_installments int not null,
  financing_start_date date not null,
  base_installment_value numeric(14, 2) not null,
  correction_type text not null default 'ipca_anual',
  correction_base_date date not null,
  correction_frequency_months int not null default 12,
  forecast_annual_ipca numeric(6, 4) not null default 0.05,
  status text not null default 'ativo'
    check (status in ('ativo', 'quitado', 'atrasado', 'renegociado', 'cancelado')),
  internal_notes text default '',
  client_notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Pagamentos
-- ---------------------------------------------------------------------------
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts (id) on delete cascade,
  installment_type text not null check (installment_type in ('entrada', 'financiamento')),
  installment_number int not null,
  payment_date date not null,
  amount numeric(14, 2) not null default 0,
  amortization_amount numeric(14, 2) not null default 0,
  payment_type text not null default 'pix',
  pix_key_id uuid,
  receipt_url text,
  status text not null default 'em_aberto',
  notes text default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (contract_id, installment_type, installment_number)
);

-- ---------------------------------------------------------------------------
-- Correções IPCA aplicadas (oficiais)
-- ---------------------------------------------------------------------------
create table if not exists ipca_corrections (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts (id) on delete cascade,
  index int not null,
  correction_date date not null,
  ipca_percentage numeric(8, 6) not null,
  notes text default '',
  created_at timestamptz not null default now(),
  unique (contract_id, index)
);

-- ---------------------------------------------------------------------------
-- Chaves Pix (com histórico)
-- ---------------------------------------------------------------------------
create table if not exists pix_keys (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts (id) on delete cascade,
  pix_key text not null default '',
  receiver_name text default '',
  bank_name text default '',
  active_from date not null,
  active_until date,
  status text not null default 'ativa' check (status in ('ativa', 'inativa')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------------------
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  contract_id uuid references contracts (id) on delete set null,
  action text not null,
  description text not null default '',
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_contracts_client on contracts (client_id);
create index if not exists idx_payments_contract on payments (contract_id);
create index if not exists idx_corrections_contract on ipca_corrections (contract_id);
create index if not exists idx_pix_contract on pix_keys (contract_id);
create index if not exists idx_audit_contract on audit_logs (contract_id);

-- ============================================================================
-- Segurança (Row Level Security)
-- ============================================================================
alter table profiles enable row level security;
alter table clients enable row level security;
alter table contracts enable row level security;
alter table payments enable row level security;
alter table ipca_corrections enable row level security;
alter table pix_keys enable row level security;
alter table audit_logs enable row level security;

-- Profiles: cada um lê o próprio; admin lê todos.
create policy profiles_self_read on profiles for select
  using (id = auth.uid() or is_admin());

-- Admin pode tudo; cliente só LÊ o que é do seu client_id.
-- Padrão: políticas de leitura para o cliente + políticas totais para admin.

-- CLIENTS
create policy clients_admin_all on clients for all using (is_admin()) with check (is_admin());
create policy clients_client_read on clients for select using (
  id = (select client_id from profiles where id = auth.uid())
);

-- CONTRACTS
create policy contracts_admin_all on contracts for all using (is_admin()) with check (is_admin());
create policy contracts_client_read on contracts for select using (
  client_id = (select client_id from profiles where id = auth.uid())
);

-- Helper: o contrato pertence ao cliente logado?
create or replace function owns_contract(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from contracts ct
    join profiles p on p.id = auth.uid()
    where ct.id = c and ct.client_id = p.client_id
  );
$$;

-- PAYMENTS — admin tudo; cliente lê os seus e pode INSERIR comprovante.
create policy payments_admin_all on payments for all using (is_admin()) with check (is_admin());
create policy payments_client_read on payments for select using (owns_contract(contract_id));
create policy payments_client_insert on payments for insert
  with check (owns_contract(contract_id) and status = 'comprovante_enviado');

-- IPCA — admin tudo; cliente lê.
create policy ipca_admin_all on ipca_corrections for all using (is_admin()) with check (is_admin());
create policy ipca_client_read on ipca_corrections for select using (owns_contract(contract_id));

-- PIX — admin tudo; cliente lê.
create policy pix_admin_all on pix_keys for all using (is_admin()) with check (is_admin());
create policy pix_client_read on pix_keys for select using (owns_contract(contract_id));

-- AUDIT — somente admin.
create policy audit_admin_all on audit_logs for all using (is_admin()) with check (is_admin());

-- ============================================================================
-- Storage para comprovantes (rode no SQL Editor após criar o bucket 'receipts')
-- ============================================================================
-- 1) Em Storage, crie um bucket privado chamado 'receipts'.
-- 2) Políticas sugeridas:
-- create policy "receipts admin" on storage.objects for all
--   using (bucket_id = 'receipts' and is_admin());
-- create policy "receipts client upload" on storage.objects for insert
--   with check (bucket_id = 'receipts' and auth.role() = 'authenticated');

-- ============================================================================
-- Seed opcional (contrato-exemplo) — ajuste os UUIDs conforme necessário.
-- Crie antes os usuários no Auth e preencha profiles.client_id manualmente.
-- ============================================================================
