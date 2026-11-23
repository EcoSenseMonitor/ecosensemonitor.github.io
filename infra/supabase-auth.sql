-- EcoSenseMonitor: modelo inicial de identidade e aprovação de contas.
-- Execute uma única vez no SQL Editor do projeto Supabase.
-- Aprovação é controlada pelo servidor. Nunca use service_role no navegador.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  approved boolean not null default false,
  role text not null default 'viewer' check (role in ('viewer','operator','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profile_read_own" on public.profiles;
create policy "profile_read_own" on public.profiles
for select to authenticated using (auth.uid() = user_id);
-- Nenhuma política de UPDATE / INSERT / DELETE para clientes:
-- somente administradores via backend seguro ou SQL Editor podem aprovar.
create or replace function public.create_user_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, full_name, approved, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name',''), false, 'viewer')
  on conflict (user_id) do nothing;
  return new;
end; $$;
drop trigger if exists trg_user_profile on auth.users;
create trigger trg_user_profile after insert on auth.users
for each row execute function public.create_user_profile();
-- Após conferir e-mail/identidade do usuário, o administrador pode aprovar:
-- update public.profiles set approved = true, role = 'admin' where user_id = '<UUID-CONFERIDO>';
-- Nunca substituir '<UUID-CONFERIDO>' sem validar o destinatário.
