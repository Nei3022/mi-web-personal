alter table recetas
add column if not exists preparacion text not null default '';