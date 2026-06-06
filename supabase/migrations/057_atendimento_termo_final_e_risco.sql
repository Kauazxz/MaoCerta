-- ============================================================
-- F3 do novo motor de atendimento.
--
-- 1) Estende termos_conclusao_atendimento com campos necessarios
--    para o novo fluxo de termo final (plano_id, html_relatorio,
--    hash_relatorio, dispensado_por_admin_at) e amplia os status
--    permitidos.
-- 2) Trigger detector de risco em mensagens_atendimento (tipo='usuario'):
--    quando o conteudo bate em padroes tipo "pix por fora", gera
--    evento risco_detectado_chat (visivel apenas para admin) e uma
--    mensagem de sistema discreta avisando os participantes.
--
-- Avaliacoes ja' existem desde a 016. Sao reaproveitadas sem mudancas.
-- ============================================================

-- ============================================================
-- 1) Extensao de termos_conclusao_atendimento
-- ============================================================
alter table public.termos_conclusao_atendimento
  add column if not exists plano_id uuid references public.planos_atendimento(id) on delete set null,
  add column if not exists html_relatorio text,
  add column if not exists pdf_url text,
  add column if not exists hash_relatorio text,
  add column if not exists dispensado_por_admin_at timestamptz,
  add column if not exists dispensado_por_admin_id uuid references public.profiles(id) on delete set null,
  add column if not exists dispensado_por_admin_motivo text,
  add column if not exists snapshot_atendimento jsonb;

-- Amplia status: aguardando_assinatura_cliente, assinado_cliente,
-- assinado_ambos, dispensado_por_admin
alter table public.termos_conclusao_atendimento
  drop constraint if exists termos_conclusao_atendimento_status_check;

alter table public.termos_conclusao_atendimento
  add constraint termos_conclusao_atendimento_status_check
  check (status in (
    'aguardando',
    'aguardando_assinatura_cliente',
    'assinado_cliente',
    'assinado_ambos',
    'confirmado',
    'dispensado_por_admin',
    'cancelado'
  ));

-- ============================================================
-- 2) Detector de risco em mensagens_atendimento
-- ============================================================
-- Padroes simples e explicitos. Foco em pagamento por fora / contato
-- direto. Lista pode crescer sem precisar mexer no trigger.
create or replace function public.fn_atendimento_texto_de_risco(p_texto text)
returns text
language sql
stable
as $$
  with padroes(rotulo, regex) as (
    values
      ('pix_por_fora',    '\b(paga|me\s+paga|paga\s+na\s+minha|paga\s+no\s+meu)\s+(por\s+fora|fora\s+do\s+app)\b'),
      ('pix_direto',      '\bpix\s+direto\b'),
      ('chave_pix',       '\bminha\s+chave\s+pix\b'),
      ('manda_no_pix',    '\bmanda\s+no\s+meu\s+pix\b'),
      ('sem_app',         '\bsem\s+(o\s+)?app\b'),
      ('cancela_aqui',    '\bcancela\s+aqui\b'),
      ('paga_minha_conta','\bpaga\s+na\s+minha\s+conta\b'),
      ('contestar_mp',    '\bmercado\s+pago\s+n[ãa]o\b'),
      ('vai_pro_zap',     '\b(chama|me\s+chama)\s+no\s+(zap|whats|whatsapp)\b'),
      ('whats_direto',    '\bwhats(app)?\s+(direto|particular|pessoal)\b')
  )
  select rotulo
  from padroes
  where p_texto ~* regex
  limit 1;
$$;

-- Trigger AFTER INSERT em mensagens_atendimento. So' processa
-- mensagens de usuario (tipo='usuario'). Mensagens de sistema sao
-- ignoradas (sao geradas pelo proprio trigger de eventos).
create or replace function public.fn_atendimento_detectar_risco_chat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rotulo text;
  v_sol record;
  v_remete uuid;
begin
  if coalesce(new.tipo, 'usuario') <> 'usuario' then
    return new;
  end if;
  if new.conteudo is null or length(trim(new.conteudo)) = 0 then
    return new;
  end if;

  v_rotulo := public.fn_atendimento_texto_de_risco(new.conteudo);
  if v_rotulo is null then
    return new;
  end if;

  -- Cria evento visivel SO PARA ADMIN. Os participantes nao veem
  -- esse registro no historico.
  insert into public.atendimento_eventos (
    solicitacao_id, ator_id, ator_tipo, tipo_evento,
    titulo, descricao, payload, visibilidade
  ) values (
    new.solicitacao_id, new.remetente_id, 'sistema', 'risco_detectado_chat',
    'Padrao de risco detectado: ' || v_rotulo,
    left(new.conteudo, 200),
    jsonb_build_object('rotulo', v_rotulo, 'mensagem_id', new.id),
    'admin'
  );

  -- Insere aviso compacto no chat para os DOIS lados. Usa remetente
  -- novamente como profissional da solicitacao para satisfazer FK.
  select profissional_id into v_remete from public.solicitacoes where id = new.solicitacao_id;
  if v_remete is not null then
    insert into public.mensagens_atendimento (
      solicitacao_id, remetente_id, conteudo, tipo, deeplink
    ) values (
      new.solicitacao_id, v_remete,
      '⚠️ Mantenha pagamentos dentro do MaoCerta. Combinacoes por fora nao tem garantia nem suporte em disputa.',
      'sistema',
      jsonb_build_object('aviso', 'risco_pagamento_externo')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_atendimento_detectar_risco_chat on public.mensagens_atendimento;
create trigger trg_atendimento_detectar_risco_chat
  after insert on public.mensagens_atendimento
  for each row execute function public.fn_atendimento_detectar_risco_chat();
