-- 031_realtime_daily_tasks.sql
-- ✅ Asegura que daily_tasks emite eventos Realtime (postgres_changes)

DO $$
BEGIN
  -- Añadir a la publication de Supabase Realtime (si no estaba ya)
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_tasks';
  EXCEPTION
    WHEN duplicate_object THEN
      -- ya estaba
      NULL;
    WHEN undefined_object THEN
      -- si la publication no existiera (raro), no rompemos migración
      NULL;
  END;

  -- Recomendado para updates completos (no imprescindible para que funcione)
  BEGIN
    EXECUTE 'ALTER TABLE public.daily_tasks REPLICA IDENTITY FULL';
  EXCEPTION
    WHEN others THEN
      NULL;
  END;
END $$;
