-- ============================================================
-- Fix: ao cancelar um atendimento, a proposta vinculada continuava
-- com status='aceita', e isso impedia o cliente de excluir a demanda
-- (a policy demandas_delete_cliente exige que nao haja proposta
-- aceita).
--
-- O trigger sync_status_demanda_via_solicitacao (migration 013) ja
-- revertia o status da demanda para 'aberta' quando o atendimento
-- era cancelado. Agora tambem reverte a proposta_origem para
-- 'pendente' (e demais propostas suplentes voltam a 'pendente').
-- ============================================================

create or replace function public.sync_status_demanda_via_solicitacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    if new.demanda_origem_id is not null and new.status in ('aceita', 'em_andamento') then
      update public.demandas
        set status = 'em_andamento'::status_demanda
        where id = new.demanda_origem_id
          and status = 'aberta'::status_demanda;
    end if;
    return new;
  end if;

  if (tg_op = 'UPDATE') then
    -- Cancelamento: devolve a demanda para o pool aberto
    if new.demanda_origem_id is not null
       and new.status = 'cancelada'
       and coalesce(old.status::text, '') in ('aceita', 'em_andamento') then
      update public.demandas
        set status = 'aberta'::status_demanda
        where id = new.demanda_origem_id
          and status = 'em_andamento'::status_demanda;

      -- NOVO: reverte propostas dessa demanda. A que foi aceita volta
      -- para 'pendente' e as suplentes tambem voltam para 'pendente'
      -- (cliente vai poder escolher de novo OU excluir a demanda).
      update public.propostas
        set status = 'pendente'::status_proposta
        where demanda_id = new.demanda_origem_id
          and status::text in ('aceita', 'suplente');
    end if;

    -- Conclusao: marca demanda como concluida
    if new.demanda_origem_id is not null
       and new.status = 'concluida'
       and coalesce(old.status::text, '') in ('aceita', 'em_andamento') then
      update public.demandas
        set status = 'concluida'::status_demanda
        where id = new.demanda_origem_id;
    end if;

    return new;
  end if;

  return new;
end;
$$;

-- Aplica imediatamente para registros que ja' estao no estado
-- inconsistente (atendimento cancelado + proposta ainda 'aceita').
update public.propostas p
set status = 'pendente'::status_proposta
where p.id in (
  select s.proposta_origem_id
  from public.solicitacoes s
  where s.status = 'cancelada'
    and s.proposta_origem_id is not null
    and s.demanda_origem_id is not null
)
and p.status::text = 'aceita';
