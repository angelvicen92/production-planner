-- Add plan_id to contestants so they belong to a plan
alter table public.contestants
add column if not exists plan_id integer references public.plans(id);

create index if not exists contestants_plan_id_idx on public.contestants(plan_id);
