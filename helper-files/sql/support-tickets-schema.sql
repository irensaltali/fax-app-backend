create table public.support_tickets (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  email text not null,
  message text not null,
  category public.support_ticket_category not null default 'general'::support_ticket_category,
  status public.support_ticket_status not null default 'open'::support_ticket_status,
  app_version text not null,
  build_number text not null,
  device_info jsonb not null,
  user_agent text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint support_tickets_pkey primary key (id),
  constraint support_tickets_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists support_tickets_user_id_idx on public.support_tickets using btree (user_id) TABLESPACE pg_default;

create index IF not exists support_tickets_status_idx on public.support_tickets using btree (status) TABLESPACE pg_default;

create index IF not exists support_tickets_created_at_idx on public.support_tickets using btree (created_at desc) TABLESPACE pg_default;

create index IF not exists support_tickets_category_idx on public.support_tickets using btree (category) TABLESPACE pg_default;

create index IF not exists support_tickets_app_version_idx on public.support_tickets using btree (app_version) TABLESPACE pg_default;

create index IF not exists support_tickets_build_number_idx on public.support_tickets using btree (build_number) TABLESPACE pg_default;

create index IF not exists support_tickets_device_info_idx on public.support_tickets using gin (device_info) TABLESPACE pg_default;

create trigger update_support_tickets_updated_at BEFORE
update on support_tickets for EACH row
execute FUNCTION update_updated_at_column ();
