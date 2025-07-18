create table public.faxes (
  id uuid not null default gen_random_uuid (),
  user_id uuid null,
  provider_fax_id text not null,
  status public.fax_status not null default 'queued'::fax_status,
  original_status text not null,
  recipients jsonb not null default '[]'::jsonb,
  sender_id text null,
  subject text null,
  pages integer null default 0,
  cost numeric(10, 4) null,
  client_reference text null default 'SendFaxPro'::text,
  sent_at timestamp with time zone null,
  completed_at timestamp with time zone null,
  error_message text null,
  metadata jsonb null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  r2_urls jsonb null,
  constraint faxes_pkey primary key (id),
  constraint faxes_provider_fax_id_key unique (provider_fax_id),
  constraint faxes_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE,
  constraint faxes_cost_positive check (
    (
      (cost is null)
      or (cost >= (0)::numeric)
    )
  ),
  constraint faxes_pages_positive check ((pages >= 0)),
  constraint faxes_recipients_not_empty check ((jsonb_array_length(recipients) > 0))
) TABLESPACE pg_default;

create index IF not exists faxes_user_id_idx on public.faxes using btree (user_id) TABLESPACE pg_default;

create index IF not exists faxes_status_idx on public.faxes using btree (status) TABLESPACE pg_default;

create index IF not exists faxes_created_at_idx on public.faxes using btree (created_at desc) TABLESPACE pg_default;

create index IF not exists faxes_sent_at_idx on public.faxes using btree (sent_at desc) TABLESPACE pg_default;

create index IF not exists faxes_user_created_idx on public.faxes using btree (user_id, created_at desc) TABLESPACE pg_default;

create index IF not exists faxes_recipients_gin_idx on public.faxes using gin (recipients) TABLESPACE pg_default;

create index IF not exists faxes_metadata_gin_idx on public.faxes using gin (metadata) TABLESPACE pg_default;

create index IF not exists faxes_provider_fax_id_idx on public.faxes using btree (provider_fax_id) TABLESPACE pg_default;

create trigger update_faxes_updated_at BEFORE
update on faxes for EACH row
execute FUNCTION update_updated_at_column ();
