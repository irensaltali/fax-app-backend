create table public.contacts (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  name text not null,
  fax_number text not null,
  notes text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  country_code text not null default 'US'::text,
  constraint contacts_pkey primary key (id),
  constraint contacts_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists contacts_user_id_idx on public.contacts using btree (user_id) TABLESPACE pg_default;

create index IF not exists contacts_name_idx on public.contacts using btree (name) TABLESPACE pg_default;

create index IF not exists contacts_created_at_idx on public.contacts using btree (created_at desc) TABLESPACE pg_default;

create index IF not exists contacts_country_code_idx on public.contacts using btree (country_code) TABLESPACE pg_default;

create trigger update_contacts_updated_at BEFORE
update on contacts for EACH row
execute FUNCTION update_updated_at_column ();
