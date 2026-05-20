-- ============================================================
-- Fix: trigger marcar_propostas_suplentes usava
--   coalesce(old.status, '')
-- onde old.status e' do tipo enum status_proposta. Em algumas
-- versoes/configuracoes do Postgres, isso forca o cast de ''
-- para status_proposta antes do COALESCE, e como '' nao e' um
-- valor valido do enum, da' o erro:
--   "invalid input value for enum status_proposta: """
--
-- Sintoma: ao escolher prestador na demanda, a solicitacao e'
-- criada com sucesso, mas o UPDATE da proposta para 'aceita'
-- falha com a mensagem acima.
--
-- Fix: usa old.status::text na comparacao para evitar o cast
-- implicito problematico.
-- ============================================================

create or replace function public.marcar_propostas_suplentes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'aceita'
     and (old.status is null or old.status::text <> 'aceita') then
    update public.propostas
      set status = 'suplente'
      where demanda_id = new.demanda_id
        and id <> new.id
        and status = 'pendente';
  end if;
  return new;
end;
$$;
