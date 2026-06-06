# Plano de Reformulação do Motor de Atendimento — MaoCerta

> Documento de planejamento. Nenhum código foi alterado ainda.  
> Modelo antigo (etapas/acordos/agendamento_propostas) **permanece intocado** até a F4.
> Atendimentos novos podem optar pelo novo motor; antigos seguem como hoje.

---

## 0. Filosofia em uma linha

> **Nada financeiro nasce do chat. Tudo financeiro nasce de uma proposta formal aceita por ambos.**

O motor novo separa em **camadas com responsabilidades claras**:

```
conversa ── plano ── itens ── cobranças ── pagamento ── histórico ── termo final ── avaliação
   ↑                                                       ↑
   chat livre                              tabela append-only de eventos
```

---

## 1. Modelo de dados (F1)

### 1.1 `planos_atendimento`

Um plano por solicitação ativa (uma `solicitacao` pode ter outros encerrados em histórico).

```sql
create table planos_atendimento (
  id              uuid primary key default gen_random_uuid(),
  solicitacao_id  uuid not null references solicitacoes(id) on delete cascade,
  titulo          text not null,
  descricao       text,
  modelo          text not null check (modelo in (
                    'servico_simples', 'pagamento_antes', 'pagamento_depois',
                    'por_hora', 'por_diaria', 'por_etapa', 'personalizado')),
  status          text not null default 'rascunho' check (status in (
                    'rascunho', 'em_negociacao', 'ativo',
                    'concluido', 'cancelado', 'em_disputa')),
  criado_por      uuid references profiles(id),
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Apenas UM plano ativo por solicitação
create unique index uniq_plano_ativo_por_solicitacao
  on planos_atendimento(solicitacao_id)
  where status in ('rascunho', 'em_negociacao', 'ativo');
```

### 1.2 `plano_itens_atendimento`

Cada coisa que o profissional vai cobrar/executar.

```sql
create table plano_itens_atendimento (
  id              uuid primary key default gen_random_uuid(),
  plano_id        uuid not null references planos_atendimento(id) on delete cascade,
  solicitacao_id  uuid not null references solicitacoes(id) on delete cascade,
  tipo            text not null check (tipo in (
                    'vistoria','servico','diaria','hora','etapa','extra','sinal','final','ajuste')),
  titulo          text not null,
  descricao       text,
  ordem           int not null default 0,
  unidade         text not null default 'fixa' check (unidade in (
                    'fixa','hora','dia','etapa','extra')),
  quantidade_prevista     numeric(10,2),
  quantidade_realizada    numeric(10,2),
  valor_unitario          numeric(10,2),
  valor_total_previsto    numeric(10,2),
  valor_total_final       numeric(10,2),
  momento_pagamento       text not null check (momento_pagamento in (
                            'antes','depois','por_confirmacao','final','sem_cobranca')),
  requer_pagamento_para_iniciar       boolean not null default false,
  requer_confirmacao_cliente_para_cobrar boolean not null default true,
  permite_extra           boolean not null default true,
  obrigatorio             boolean not null default true,
  status                  text not null default 'rascunho' check (status in (
                            'rascunho','enviado','aceito','recusado',
                            'aguardando_pagamento','pago','pronto_para_iniciar',
                            'em_execucao','executado_pelo_profissional',
                            'aguardando_confirmacao_cliente','confirmado_pelo_cliente',
                            'aguardando_pagamento_final','concluido',
                            'contestado','cancelado')),
  inicio_previsto         timestamptz,
  fim_previsto            timestamptz,
  inicio_real             timestamptz,
  fim_real                timestamptz,
  aceito_cliente_at       timestamptz,
  aceito_profissional_at  timestamptz,
  confirmado_cliente_at   timestamptz,
  confirmado_profissional_at timestamptz,
  criado_por              uuid references profiles(id),
  metadata                jsonb not null default '{}',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index idx_plano_itens_plano    on plano_itens_atendimento(plano_id, ordem);
create index idx_plano_itens_status   on plano_itens_atendimento(solicitacao_id, status);
```

### 1.3 `cobrancas_atendimento`

Cobrança = ponte entre item e Pix. Único lugar autorizado a gerar Pix.

```sql
create table cobrancas_atendimento (
  id              uuid primary key default gen_random_uuid(),
  solicitacao_id  uuid not null references solicitacoes(id) on delete cascade,
  plano_id        uuid references planos_atendimento(id) on delete set null,
  item_id         uuid references plano_itens_atendimento(id) on delete set null,
  pagamento_id    uuid references pagamentos(id) on delete set null,
  tipo            text not null check (tipo in (
                    'vistoria','sinal','base','diaria','hora','etapa','extra','final','ajuste')),
  titulo          text not null,
  descricao       text,
  valor           numeric(10,2) not null check (valor > 0),
  moeda           text not null default 'BRL',
  status          text not null default 'rascunho' check (status in (
                    'rascunho','aguardando_aceite','aceita','pix_gerado',
                    'aguardando_pagamento','paga','retida','liberada',
                    'contestada','cancelada','expirada')),
  requer_aceite_cliente       boolean not null default true,
  requer_aceite_profissional  boolean not null default false,
  aceite_cliente_at           timestamptz,
  aceite_profissional_at      timestamptz,
  mp_payment_id               text,
  mp_external_reference       text,
  pix_qr_code                 text,
  pix_qr_code_base64          text,
  pix_copia_cola              text,
  pix_expira_em               timestamptz,
  pago_em                     timestamptz,
  liberado_em                 timestamptz,
  retido_em                   timestamptz,
  contestado_em               timestamptz,
  criado_por                  uuid references profiles(id),
  metadata                    jsonb not null default '{}',
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create unique index uniq_cobranca_mp_payment on cobrancas_atendimento(mp_payment_id) where mp_payment_id is not null;
create index idx_cobrancas_solicitacao_status on cobrancas_atendimento(solicitacao_id, status);
create index idx_cobrancas_item on cobrancas_atendimento(item_id);
```

### 1.4 `atendimento_eventos` — histórico append-only

```sql
create table atendimento_eventos (
  id              bigserial primary key,
  solicitacao_id  uuid not null references solicitacoes(id) on delete cascade,
  plano_id        uuid,
  item_id         uuid,
  cobranca_id     uuid,
  pagamento_id    uuid,
  ator_id         uuid references profiles(id),
  ator_tipo       text not null check (ator_tipo in ('cliente','profissional','admin','sistema')),
  tipo_evento     text not null,
  titulo          text,
  descricao       text,
  payload         jsonb not null default '{}',
  visibilidade    text not null default 'participantes' check (visibilidade in (
                    'participantes','admin','sistema')),
  created_at      timestamptz not null default now()
);

create index idx_eventos_solicitacao_created on atendimento_eventos(solicitacao_id, created_at desc);
create index idx_eventos_tipo on atendimento_eventos(tipo_evento);
```

**Sem UPDATE/DELETE policy → append-only por design.**

### 1.5 Reaproveitar `termos_conclusao_atendimento`

Vou auditar o que já existe e propor um patch (campos faltantes: `status`, `pdf_url`, `hash_relatorio`) na F3. Não criar agora.

---

## 2. RLS (resumo das policies)

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `planos_atendimento` | participante OR admin | participante (cliente/profissional da solicitação) OR admin | participante OR admin | só admin |
| `plano_itens_atendimento` | participante OR admin | profissional da solicitação OR admin | profissional ou cliente conforme transição OR admin | só admin |
| `cobrancas_atendimento` | participante OR admin | profissional OR admin | só RPC `SECURITY DEFINER` (não direto) | só admin |
| `atendimento_eventos` | participante (visibilidade='participantes' OR admin) | só RPC `SECURITY DEFINER` | NÃO | NÃO |

Todas as policies usam `(select auth.uid())` e `(select public.is_administrator())` (lição aprendida na 050).

---

## 3. Funções SQL (RPCs)

Todas em PL/pgSQL, `security definer`, `search_path = public`, validam autorização internamente e gravam evento em `atendimento_eventos` ao final. Retornam `json` com `{ ok, ... }` no padrão do projeto.

| Função | Assinatura | Quem chama | O que faz |
|---|---|---|---|
| `fn_criar_plano_atendimento` | `(p_solicitacao_id, p_titulo, p_descricao, p_modelo)` | profissional | cria plano em rascunho; se já houver ativo, erro `ja_existe_plano_ativo` |
| `fn_criar_item_plano` | `(p_plano_id, p_dados jsonb)` | profissional | insere item em rascunho |
| `fn_enviar_proposta_item` | `(p_item_id)` | profissional | status: rascunho→enviado, gera evento `item_enviado` |
| `fn_aceitar_item_plano` | `(p_item_id)` | cliente | enviado→aceito, marca `aceito_cliente_at`, se `momento_pagamento='antes'` cria cobrança automaticamente |
| `fn_recusar_item_plano` | `(p_item_id, p_motivo)` | cliente | enviado→recusado |
| `fn_pedir_alteracao_item` | `(p_item_id, p_sugestao jsonb)` | cliente | enviado→rascunho, registra contraproposta no payload do evento |
| `fn_iniciar_item_plano` | `(p_item_id)` | profissional | valida `requer_pagamento_para_iniciar` (se sim, cobrança vinculada precisa estar paga); aceito/pronto→em_execucao, marca `inicio_real` |
| `fn_marcar_item_executado` | `(p_item_id, p_quantidade_realizada, p_notas)` | profissional | em_execucao→executado_pelo_profissional, marca `fim_real` |
| `fn_confirmar_execucao_item` | `(p_item_id)` | cliente | executado→confirmado; se item `momento_pagamento='depois'`, cria cobrança |
| `fn_contestar_item` | `(p_item_id, p_motivo)` | cliente | qualquer status executado/confirmado→contestado, abre disputa |
| `fn_criar_cobranca_atendimento` | `(p_item_id, p_valor, p_titulo, p_descricao, p_tipo)` | profissional ou RPC interna | cria em aguardando_aceite (ou em pix_gerado se tipo permite pix imediato) |
| `fn_aceitar_cobranca_atendimento` | `(p_cobranca_id)` | cliente | aguardando_aceite→aceita |
| `fn_marcar_cobranca_paga` | `(p_cobranca_id, p_mp_payment_id)` | webhook (service_role) | aguardando_pagamento→paga; cria evento; se item tem ligação, evolui item |
| `fn_liberar_cobranca` | `(p_cobranca_id)` | sistema (após confirmação cliente do item) | paga→liberada; credita escrow do prestador |
| `fn_criar_evento_atendimento` | `(p_solicitacao_id, p_tipo, p_titulo, p_descricao, p_payload, p_visibilidade)` | RPCs internas | helper |
| `fn_tentar_concluir_atendimento` | `(p_solicitacao_id)` | cliente OR sistema | só conclui se: nenhum item obrigatório aberto, nenhuma cobrança pendente, sem disputa, termo final assinado |

**F3 adicional:** `fn_gerar_termo_final`, `fn_assinar_termo_final`.

---

## 4. Types TypeScript

Arquivo: `src/types/atendimento.ts`

```typescript
export type ModeloPlano =
  | 'servico_simples' | 'pagamento_antes' | 'pagamento_depois'
  | 'por_hora' | 'por_diaria' | 'por_etapa' | 'personalizado'

export type StatusPlano = 'rascunho' | 'em_negociacao' | 'ativo' | 'concluido' | 'cancelado' | 'em_disputa'

export type TipoItem = 'vistoria'|'servico'|'diaria'|'hora'|'etapa'|'extra'|'sinal'|'final'|'ajuste'
export type UnidadeItem = 'fixa'|'hora'|'dia'|'etapa'|'extra'
export type MomentoPagamento = 'antes'|'depois'|'por_confirmacao'|'final'|'sem_cobranca'
export type StatusItem =
  | 'rascunho' | 'enviado' | 'aceito' | 'recusado'
  | 'aguardando_pagamento' | 'pago' | 'pronto_para_iniciar'
  | 'em_execucao' | 'executado_pelo_profissional'
  | 'aguardando_confirmacao_cliente' | 'confirmado_pelo_cliente'
  | 'aguardando_pagamento_final' | 'concluido' | 'contestado' | 'cancelado'

export type TipoCobranca = 'vistoria'|'sinal'|'base'|'diaria'|'hora'|'etapa'|'extra'|'final'|'ajuste'
export type StatusCobranca =
  | 'rascunho' | 'aguardando_aceite' | 'aceita' | 'pix_gerado'
  | 'aguardando_pagamento' | 'paga' | 'retida' | 'liberada'
  | 'contestada' | 'cancelada' | 'expirada'

export type TipoEvento =
  | 'solicitacao_criada' | 'profissional_aceitou' | 'profissional_recusou'
  | 'mensagem_enviada' | 'plano_criado' | 'item_enviado'
  | 'item_aceito_cliente' | 'item_recusado_cliente' | 'item_alterado'
  | 'cobranca_criada' | 'cobranca_extra_criada' | 'cobranca_aceita'
  | 'pix_gerado' | 'pagamento_confirmado' | 'pagamento_liberado'
  | 'item_iniciado' | 'item_executado_profissional' | 'item_confirmado_cliente'
  | 'item_contestado' | 'termo_gerado' | 'termo_assinado_cliente'
  | 'avaliacao_realizada' | 'atendimento_concluido' | 'atendimento_cancelado'
  | 'disputa_aberta' | 'decisao_admin' | 'risco_detectado_chat'

export interface PlanoAtendimento { /* campos da tabela 1.1 */ }
export interface ItemPlano { /* campos da tabela 1.2 */ }
export interface CobrancaAtendimento { /* campos da tabela 1.3 */ }
export interface EventoAtendimento { /* campos da tabela 1.4 */ }
```

---

## 5. Camada Supabase (services)

Arquivo por contexto. Cada função é fina — só monta input/output e chama RPC.

### `src/lib/supabase/atendimento-plano.ts`
```typescript
buscarAtendimentoCompleto(solicitacaoId: string): Promise<{
  plano: PlanoAtendimento | null
  itens: ItemPlano[]
  cobrancas: CobrancaAtendimento[]
  eventos: EventoAtendimento[]
}>
criarPlanoAtendimento(input): Promise<PlanoAtendimento>
criarItemPlano(input)
enviarPropostaItem(itemId)
aceitarItemPlano(itemId)
recusarItemPlano(itemId, motivo)
pedirAlteracaoItem(itemId, sugestao)
iniciarItem(itemId)
marcarItemExecutado(itemId, qtdReal?, notas?)
confirmarExecucaoItem(itemId)
contestarItem(itemId, motivo)
```

### `src/lib/supabase/atendimento-cobrancas.ts`
```typescript
criarCobrancaItem(itemId, ...)
criarCobrancaExtra(solicitacaoId, valor, titulo, descricao)
aceitarCobranca(cobrancaId)
recusarCobranca(cobrancaId, motivo)
gerarPixCobranca(cobrancaId)         // chama /api/pix/cobranca/criar
consultarStatusPixCobranca(cobrancaId) // chama /api/pix/cobranca/status
```

### `src/lib/supabase/atendimento-eventos.ts`
```typescript
listarHistoricoAtendimento(solicitacaoId, opts?)  // com paginação
```

### `src/lib/supabase/atendimento-realtime.ts`
```typescript
useAtendimentoRealtime(solicitacaoId)  // hook que retorna { plano, itens, cobrancas, eventos, refresh }
```

---

## 6. Endpoints HTTP (F1)

### Novos
| Rota | Método | O que faz |
|---|---|---|
| `/api/pix/cobranca/criar` | POST | recebe `{ cobranca_id }`, chama MP API, salva qr_code base64/copia_cola/expira, atualiza cobrança para `pix_gerado` |
| `/api/pix/cobranca/status` | GET | retorna status atual de uma cobrança (banco + opcionalmente MP se `pix_gerado`) |

### Atualizado
| Rota | Mudança |
|---|---|
| `/api/webhooks/mercado-pago` | adicionar branch `external_reference.startsWith('cobranca:')` → chama `fn_marcar_cobranca_paga`. Branches existentes (`plano:`, `etapa:`) permanecem intocados. |

**Idempotência:** validar `mp_payment_id` no `unique index` de `cobrancas_atendimento`. Webhook duplicado retorna `{ ok: true, duplicate: true }` sem re-creditar.

---

## 7. Componentes React (F1)

Apenas o esqueleto da nova tela. Sem entrar nos modais ainda (F2).

```
src/components/atendimento-novo/
├── AtendimentoShell.tsx              ← layout container; abas Conversa/Plano/Pagamentos/Histórico/Termo
├── AtendimentoStatusCard.tsx         ← header com status atual + valor total
├── ProximaAcaoAtendimento.tsx        ← botão grande contextual (perfil-aware)
├── PlanoAtendimentoPanel.tsx         ← lista os itens
├── CardItemPlano.tsx                 ← um item (proposta, execução, etc)
├── PagamentosAtendimentoPanel.tsx    ← lista cobranças com status
├── CardCobrancaAtendimento.tsx       ← uma cobrança (Pix card)
└── HistoricoAtendimentoPanel.tsx     ← timeline de atendimento_eventos
```

**F2:** ChatAtendimentoNovo, modais (CriarProposta, CobrancaExtra, FechamentoHoras), próximaAção mais sofisticada.  
**F3:** TermoFinalPanel, avaliação, admin com risco.

---

## 8. Realtime (F2 — mencionar aqui para alinhamento)

Hook `useAtendimentoRealtime(solicitacaoId)` cria UM canal nomeado:
```
canal: atend:{solicitacaoId}
```

Subscreve postgres_changes em (filter `solicitacao_id=eq.{id}`):
- `mensagens_atendimento`
- `planos_atendimento`
- `plano_itens_atendimento`
- `cobrancas_atendimento`
- `atendimento_eventos`
- `termos_conclusao_atendimento` (F3)

Estratégia de atualização: ao receber evento, invalida cache local com `react-query` ou refaz `buscarAtendimentoCompleto`. Optimistic update nos mutations principais com rollback em erro.

**Cleanup:** `removeChannel` no unmount. Canal único = sem duplicação.

---

## 9. Mensagens de sistema no chat (F2)

Quando triggers/RPCs gravam certos eventos, também inserem uma mensagem compacta em `mensagens_atendimento` com `tipo='sistema'` (precisa adicionar coluna `tipo` à tabela). Lista canônica:

| Evento | Mensagem |
|---|---|
| `item_enviado` | "Proposta enviada: {titulo} por R$ {valor}" |
| `item_aceito_cliente` | "Cliente aceitou a proposta {titulo}" |
| `pix_gerado` | "Pix gerado · R$ {valor}" |
| `pagamento_confirmado` | "Pagamento confirmado" |
| `item_executado_profissional` | "Profissional marcou a etapa como executada" |
| `item_contestado` | "Cliente contestou a cobrança" |
| `termo_gerado` | "Termo final aguardando assinatura" |
| `atendimento_concluido` | "Atendimento concluído ✓" |

Cada uma carrega `metadata.deeplink` apontando para a aba/card. Clicar leva direto.

---

## 10. Detector de risco no chat (F3)

Pacote novo: `src/lib/atendimento/detector-risco.ts`

Regex sobre cada mensagem nova:
```typescript
const PADROES_RISCO = [
  /\bpix\s+direto\b/i,
  /\b(paga|me\s+paga|paga\s+na\s+minha|paga\s+no\s+meu)\s+(por\s+fora|fora\s+do\s+app)\b/i,
  /\bminha\s+chave\s+pix\b/i,
  /\bmanda\s+no\s+meu\s+pix\b/i,
  /\bsem\s+(o\s+)?app\b/i,
  /\bcancela\s+aqui\b/i,
  /\bpaga\s+na\s+minha\s+conta\b/i,
  /\bmercado\s+pago\s+n[ãa]o\b/i,
  /\b(chama|me\s+chama)\s+no\s+(zap|whats|whatsapp)\b/i,
]
```

Ação ao detectar:
1. Gera evento `risco_detectado_chat` com `visibilidade='admin'` no histórico.
2. Mostra **aviso leve no chat para os dois lados** (não bloqueia): "Para sua segurança, mantenha pagamentos dentro do MaoCerta..."
3. Painel admin lista pelo evento.

---

## 11. Coexistência com modelo antigo (intocado)

Conforme decidido:

- Toda lógica antiga (acordos_chat_sugeridos, etapas_atendimento, agendamento_propostas) **fica como está**.
- A tela atual de atendimento continua sendo `AbasAtendimento`/`CardEtapa`/etc.
- A nova tela é **opt-in** via rota `/cliente/atendimentos/[id]/novo` e `/profissional/atendimentos/[id]/novo` (ou flag de feature no perfil/atendimento).
- **Atendimento que tenha `planos_atendimento` row** vê o novo motor; senão, vê o antigo. Switch único.
- Webhook MP: novo branch `cobranca:` é aditivo — `plano:` e `etapa:` continuam funcionando.

Decisão crítica: **não criar plano automático para atendimentos antigos na F1**. Migração na F4.

---

## 12. F4 — migração planejada (apenas registrar agora)

Script SQL que, para cada `solicitacao` com etapas:
1. Cria `planos_atendimento` titulo='Legado' modelo='personalizado' status correspondente.
2. Para cada `etapa`, cria `plano_itens_atendimento` mapeando tipo/status/valor.
3. Para cada `pagamento`, cria `cobrancas_atendimento` linkando ao item.
4. Insere evento `solicitacao_criada` + `migrado_para_novo_modelo` no histórico.

Rodável **incrementalmente** (idempotente) por flag de migração no metadata.

---

## 13. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Quebrar Pix em produção | Webhook só ganha branch novo, branches antigos intocados. Index único em `mp_payment_id` evita duplicação cruzada. |
| Cobranças duplicadas | RPC `fn_criar_cobranca` valida que não existe cobrança ativa para o mesmo item. |
| Realtime flood | Canal único por atendimento, filtros server-side, debounce nos refetchs. |
| Item travado em status intermediário | RPC `fn_tentar_concluir_atendimento` roda em job admin diário. Admin pode forçar `dispensado` via `decisao_admin`. |
| RLS muito frouxa | Auditoria por subagent antes de aplicar migration. Policy padrão = deny; só permite o documentado. |
| Cliente esquece de assinar termo | F3: timer + lembrete em 48h + opção admin de encerrar por inércia (`dispensado_por_admin`). |
| Subscriptions duplicadas | Single useEffect com cleanup; canal nomeado por solicitacaoId; lint rule futura. |

---

## 14. Lista final de arquivos (F1)

### Banco
- `supabase/migrations/054_atendimento_novo_modelo.sql` — tabelas 1.1, 1.2, 1.3, 1.4 + índices + RLS
- `supabase/migrations/055_atendimento_rpcs.sql` — todas as RPCs da seção 3 (exceto F3)
- `supabase/migrations/056_atendimento_webhook_cobranca.sql` — `fn_marcar_cobranca_paga`

### Backend HTTP
- `src/app/api/pix/cobranca/criar/route.ts` (novo)
- `src/app/api/pix/cobranca/status/route.ts` (novo)
- `src/app/api/webhooks/mercado-pago/route.ts` (edita — adiciona branch `cobranca:`)

### Types
- `src/types/atendimento.ts` (novo)

### Camada Supabase
- `src/lib/supabase/atendimento-plano.ts` (novo)
- `src/lib/supabase/atendimento-cobrancas.ts` (novo)
- `src/lib/supabase/atendimento-eventos.ts` (novo)

### UI (esqueleto navegável, sem modais ricos)
- `src/components/atendimento-novo/AtendimentoShell.tsx`
- `src/components/atendimento-novo/AtendimentoStatusCard.tsx`
- `src/components/atendimento-novo/ProximaAcaoAtendimento.tsx`
- `src/components/atendimento-novo/PlanoAtendimentoPanel.tsx`
- `src/components/atendimento-novo/CardItemPlano.tsx`
- `src/components/atendimento-novo/PagamentosAtendimentoPanel.tsx`
- `src/components/atendimento-novo/CardCobrancaAtendimento.tsx`
- `src/components/atendimento-novo/HistoricoAtendimentoPanel.tsx`
- `src/app/cliente/atendimentos/[id]/novo/page.tsx` (rota opt-in cliente)
- `src/app/profissional/atendimentos/[id]/novo/page.tsx` (rota opt-in profissional)
- `src/screens/atendimento-novo/AtendimentoNovoScreen.tsx`

### Documentação
- Este arquivo.

**Estimativa F1:** ~15 arquivos novos + 1 editado. ~1500 linhas de SQL + ~2000 linhas de TS/TSX.

---

## 15. Próximas fases (referência)

| Fase | Conteúdo |
|---|---|
| **F2** | ChatAtendimentoNovo limpo, mensagens de sistema, modais (CriarProposta, CobrancaExtra, FechamentoHoras), `useAtendimentoRealtime`, próxima-ação contextual sofisticada |
| **F3** | Termo final + assinatura eletrônica, avaliação pós-conclusão, detector de risco no chat, painel admin com visão de risco e moderação |
| **F4** | Script de migração `solicitacao` antiga → novo modelo, esconder componentes antigos da UI principal, RLS reforçada, documentação final |

---

## Decisões pendentes que preciso de você

1. **Comissão da plataforma** continua 10% também nas cobranças do novo modelo? (Sim por padrão, mas confirma.)
2. **Item com `momento_pagamento='antes'`** gera cobrança automaticamente no aceite OU exige o profissional clicar "Gerar Pix"? (Recomendo automático = menos cliques.)
3. **Cobrança extra** precisa de aceite do cliente antes do Pix? (Recomendo sim, conforme texto do prompt.)
4. **Plano único ativo por solicitação** ou múltiplos planos coexistindo (ex: vistoria + execução)? (Recomendo único — cria novo após concluir o anterior.)
5. **Termo final** assinatura eletrônica simples (checkbox "Li e confirmo") na F3 OU já agora? (Recomendo F3.)

Quando você aprovar este plano (ou ajustar), começo a F1 — primeiro a migration 054, depois as RPCs, depois types, depois Supabase services, depois UI.
