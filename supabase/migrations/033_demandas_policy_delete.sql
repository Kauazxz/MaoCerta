-- ============================================================
-- Fix: cliente clicava em "Excluir demanda" e nada acontecia.
--
-- Causa: a tabela demandas tinha policies de SELECT, INSERT e UPDATE,
-- mas nenhuma de DELETE. Com RLS ativo, qualquer DELETE feito pelo
-- cliente era bloqueado silenciosamente (0 linhas afetadas, sem erro).
--
-- Fix: cria policy que permite o cliente dono da demanda deleta-la
-- somente quando o estado ainda permite (status='aberta' e sem
-- propostas aceitas). O front ja' nao mostra o botao nesses casos,
-- mas a policy aplica a regra como backstop.
-- ============================================================

drop policy if exists "demandas_delete_cliente" on public.demandas;
create policy "demandas_delete_cliente"
  on public.demandas for delete
  to authenticated
  using (
    cliente_id = auth.uid()
    and status = 'aberta'
    and not exists (
      select 1 from public.propostas p
      where p.demanda_id = demandas.id and p.status = 'aceita'
    )
  );
