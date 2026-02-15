-- 011_program_settings.sql

create table if not exists public.program_settings (
  id integer primary key,
  meal_start text not null default '13:00',
  meal_end text not null default '16:00',
  contestant_meal_duration_minutes integer not null default 75,
  contestant_meal_max_simultaneous integer not null default 10
);

-- singleton row
insert into public.program_settings (id)
values (1)
on conflict (id) do nothing;
