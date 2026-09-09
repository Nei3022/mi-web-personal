alter table menu_semanal
add column if not exists ingredientes jsonb not null default '[]'::jsonb;