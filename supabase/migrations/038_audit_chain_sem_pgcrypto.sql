-- ============================================================
-- Fix: fn_audit_chain_append usava digest(..., 'sha256') da extensao
-- pgcrypto, que nao esta no search_path da funcao. Resultado: ao
-- confirmar Pix sandbox (fn_financeiro_confirmar_pix_sandbox chama
-- fn_audit_chain_append), o INSERT estourava com erro de funcao
-- inexistente e o front mostrava "Falha ao confirmar pagamento".
--
-- Solucao: substituir digest(..., 'sha256') por md5(...) builtin.
-- Para auditoria em sandbox/demo isso e suficiente. Quando quiser
-- audit_chain criptografico de producao basta habilitar pgcrypto
-- e voltar para digest+sha256.
-- ============================================================

create or replace function public.fn_audit_chain_append(
  p_entity_type text,
  p_entity_id uuid,
  p_actor uuid,
  p_acao text,
  p_payload jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text;
  v_row text;
begin
  select row_hash into v_prev
  from public.audit_chain
  order by id desc limit 1;

  -- FIX: md5 builtin no lugar de digest(..., 'sha256') (pgcrypto)
  v_row := md5(
    coalesce(v_prev, 'GENESIS')
      || '|' || p_entity_type || '|' || p_entity_id::text || '|' || coalesce(p_actor::text, '')
      || '|' || p_acao || '|' || coalesce(p_payload::text, '')
  );

  insert into public.audit_chain (entity_type, entity_id, actor_id, acao, payload, prev_hash, row_hash)
  values (p_entity_type, p_entity_id, p_actor, p_acao, coalesce(p_payload, '{}'::jsonb), v_prev, v_row);
end;
$$;

revoke all on function public.fn_audit_chain_append(text, uuid, uuid, text, jsonb) from public;
grant execute on function public.fn_audit_chain_append(text, uuid, uuid, text, jsonb) to authenticated;
