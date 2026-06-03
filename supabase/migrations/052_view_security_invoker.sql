-- ============================================================
-- Supabase Security Advisor flag CRITICAL:
-- "Security Definer View" em public.v_saldo_plataforma.
--
-- Por padrao, views no Postgres rodam com as permissoes do dono
-- (security definer behavior), ignorando RLS de quem consulta.
-- Trocamos para security_invoker para que a view respeite a RLS
-- da tabela platform_balance (so admin enxerga, conforme policy
-- criada na 048).
-- ============================================================

alter view public.v_saldo_plataforma set (security_invoker = true);
