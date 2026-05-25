# MaoCerta — Documento Técnico Completo

**Atualizado em:** 2026-05-20
**Estado do código:** commit `5cb09b8` na branch `main`
**Repositório:** https://github.com/KauaAraujodS/MaoCerta
**Disciplina:** Programação Orientada a Objetos II (POO II) — Universidade do aluno Kauã Araújo
**Nome do projeto na especificação original:** "iFood de Pedreiro"
**Nome oficial:** MaoCerta

> Documento gerado para ser lido por outra IA / outro humano que precise entender **tudo** sobre o projeto: o que existe, como funciona, regras de negócio, tabelas, fluxos e estado atual.

---

## 1. Visão geral

MaoCerta é uma plataforma de **intermediação de serviços presenciais** entre clientes (quem precisa de um serviço) e prestadores autônomos (quem executa o serviço).

A plataforma cobra **comissão** sobre cada serviço executado, retém o pagamento em **escrow** até a aprovação da etapa pelo cliente, e tem **três planos** por tipo de usuário (Free / Básico / Premium) com limites diferentes.

### Perfis de usuário

| Perfil | Função |
|---|---|
| `cliente` | Busca prestadores ou publica demandas. Paga por Pix. Avalia prestador. |
| `profissional` (prestador) | Recebe solicitações diretas, envia propostas em demandas públicas, executa etapas e recebe na carteira interna. |
| `administrador` | Gerencia a plataforma, dashboard financeiro, configura comissões. |

### Modelos de contratação

1. **Contratação direta** — cliente busca prestador no catálogo, clica em "Solicitar serviço", o prestador aceita/recusa.
2. **Demanda pública** — cliente publica uma demanda numa categoria, prestadores compatíveis enviam propostas (mensagem + valor + prazo), cliente compara e escolhe um. Os demais ficam como "suplentes" (RN07).

Em ambos os casos, ao aceitar/escolher, é criado um **atendimento** (linha em `solicitacoes`) com `status='aceita'`, que dispara automaticamente a criação das **etapas padrão** (via trigger).

---

## 2. Stack técnica

### Frontend
- **Next.js 14** (App Router, RSC)
- **React 18**
- **TypeScript 6** (strict)
- **TailwindCSS 3.4** com `darkMode: 'class'` — tema claro/escuro completo, alternável por botão flutuante
- **CSS-in-JS via Tailwind utility classes**, sem styled-components / emotion

### Backend / Infraestrutura
- **Supabase** (cloud, projeto `amrhutneryrkwkxxinzz`)
  - Postgres 15 com Row Level Security (RLS) ativado em todas as tabelas
  - Auth (e-mail + senha + OTP de 8 dígitos)
  - Storage (avatars públicos, documentos privados)
  - Realtime (chat em tempo real)
- **Mercado Pago** — Pix de produção integrado (mudança de plano funciona com Pix real)
- **Vercel** — deploy automático a partir do `main`
- **GitHub** — versionamento

### Bibliotecas chave
```json
"@supabase/ssr": "^0.10.3",
"@supabase/supabase-js": "^2.105.4",
"next": "^14.2.35",
"react": "^18.3.1",
"tailwindcss": "^3.4.19",
"typescript": "^6.0.3",
"vitest": "^3.0.5"
```

### Variáveis de ambiente (Vercel)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (usado em rotas API server-side)
- `MERCADO_PAGO_ACCESS_TOKEN` (produção)
- `MERCADO_PAGO_WEBHOOK_SECRET` (HMAC-SHA256)
- `NEXT_PUBLIC_APP_URL` (URL pública para notification_url do MP)

---

## 3. Estrutura de pastas

```
maocerta/
├── src/
│   ├── app/                          # Next.js App Router (pages + API routes)
│   │   ├── cadastro/                 # /cadastro
│   │   ├── entrar/                   # /entrar
│   │   ├── verificar/                # /verificar (OTP 8 dígitos)
│   │   ├── recuperar-senha/          # /recuperar-senha
│   │   ├── nova-senha/               # /nova-senha
│   │   ├── cliente/                  # área autenticada do cliente
│   │   │   ├── inicio/
│   │   │   ├── buscar/               # catálogo de prestadores
│   │   │   ├── demandas/             # lista + [id]/page.tsx para detalhe
│   │   │   ├── atendimentos/         # idem
│   │   │   ├── financeiro/           # extrato de pagamentos
│   │   │   └── configuracoes/        # conta, plano, reputação, segurança, suporte
│   │   ├── profissional/             # área do prestador (espelhada)
│   │   │   ├── inicio/
│   │   │   ├── demandas/             # demandas públicas para propor
│   │   │   ├── solicitacoes/         # pedidos diretos recebidos
│   │   │   ├── atendimentos/         # atendimentos aceitos
│   │   │   ├── servicos/             # catálogo do prestador
│   │   │   ├── carteira/             # saldo + saques
│   │   │   └── configuracoes/        # conta, plano, reputação, validação, segurança, suporte
│   │   ├── admin/                    # painel administrativo
│   │   ├── api/                      # endpoints server-side
│   │   │   ├── pix/plano/criar/      # cria Pix para mudança de plano (Mercado Pago)
│   │   │   ├── pix/plano/status/     # polling do status do Pix do plano
│   │   │   └── webhooks/mercado-pago/  # webhook HMAC-validated
│   │   ├── globals.css               # tokens dark/light + utility classes
│   │   ├── layout.tsx                # root layout
│   │   └── page.tsx                  # HomeScreen
│   ├── screens/                      # componentes "tela" (lógica + UI) — 40 arquivos
│   │   ├── HomeScreen.tsx
│   │   ├── CadastroScreen.tsx
│   │   ├── EntrarScreen.tsx
│   │   ├── VerificarScreen.tsx
│   │   ├── ...
│   │   ├── cliente/                  # Cliente*Screen, ClienteInicio, ClienteBuscar, etc.
│   │   ├── profissional/             # Profissional*Screen
│   │   ├── admin/
│   │   ├── perfil/PerfilModal.tsx    # modal compartilhado (cliente vê prestador, etc.)
│   │   ├── atendimento/ChatAtendimento.tsx
│   │   └── configuracoes/            # SegurancaScreen, SuporteScreen, CabecalhoAjuste
│   ├── components/                   # componentes reutilizáveis — 17 arquivos
│   │   ├── app/BarraTopoApp.tsx     # botões flutuantes (tema + alertas) no topo direito
│   │   ├── ui/EmptyState.tsx
│   │   ├── atendimento/AtendimentoContextoSidebar.tsx
│   │   ├── etapas/                   # AgendamentoModal, CardEtapa, ConfirmacaoEtapaModal, GerenciadorEtapas
│   │   ├── financeiro/               # PagamentoEtapaPanel, ValorServicoCard, AvaliarPrestadorCard, AvaliarClienteCard, EtapaFinanceiraTimeline, PagarPlanoModal
│   │   ├── onboarding/OnboardingChecklist.tsx
│   │   ├── CidadeEstadoSelect.tsx    # select de UF+município via IBGE
│   │   └── providers/                # ThemeProvider
│   ├── lib/
│   │   ├── supabase/                 # clients + services
│   │   │   ├── client.ts             # createClient (browser)
│   │   │   ├── server.ts             # createClient (RSC)
│   │   │   ├── admin.ts              # createServiceRoleClient (API routes)
│   │   │   ├── prestador.ts          # service (wallet, etapas, saques, atendimentos)
│   │   │   ├── financeiro.ts         # service (Pix, escrow, comissão, disputas)
│   │   │   ├── avaliacoes.ts         # service (RF46, RF47)
│   │   │   └── notificacoes.ts
│   │   ├── financeiro/status-pagamento.ts  # normalização de status entre versões
│   │   ├── categorias-ui.ts          # ícone por categoria (emoji)
│   │   ├── demo-marketplace.ts       # dados de exemplo (telas vazias)
│   │   ├── formatar-data.ts          # formatarDataPt, formatarRelativoPt, formatarValorBrl
│   │   ├── plano-limites.ts          # LIMITES_PLANO (RN02–RN17, RN32)
│   │   ├── planos-precos.ts          # PRECOS_PLANO (cliente/prestador × free/basico/premium)
│   │   └── telemetry.ts
│   └── middleware.ts                 # protege /cliente, /profissional, /admin
├── supabase/
│   ├── migrations/                   # 24 migrations versionadas
│   └── scripts/                      # SQL ad-hoc (limpeza, plano premium em massa)
├── docs/                             # este documento
├── tailwind.config.ts
├── next.config.mjs
├── tsconfig.json
└── package.json
```

---

## 4. Banco de dados

### Migrations (ordem cronológica)

| # | Arquivo | O que faz |
|---|---|---|
| 001 | `001_schema_inicial.sql` | Enums (`tipo_usuario`, `status_solicitacao`*, `status_proposta`), tabelas `profiles`, `categorias`, `servicos`, `demandas`, `propostas`, `acordos`, `mensagens`, `profissional_categorias` |
| 002 | `002_perfil_cidade.sql` | Coluna `cidade` em `profiles` |
| 003 | `003_storage_avatars.sql` | Bucket público `avatars` |
| 004 | `004_perfil_administrador_e_plano.sql` | Adiciona valor `administrador` ao enum `tipo_usuario`, cria enum `plano_usuario` (`free`/`basico`/`premium`) e coluna `plano` em `profiles` (RF04, RF07) |
| 005 | `005_perfil_bio.sql` | Coluna `bio` em `profiles` |
| 006 | `006_trigger_profile_on_signup.sql` | Trigger que cria linha em `profiles` automaticamente quando user se cadastra em `auth.users` |
| 007 | `007_rf08_rf14_base.sql` | Tabelas `solicitacoes` (atendimento), `documentos_validacao`. Coluna `status` em solicitacoes é **TEXT** (não enum) |
| 008 | `008_rf08_rf14_policies.sql` | RLS + policies de solicitacoes |
| 009 | `009_rls_core_e_storage_documentos.sql` | RLS nas tabelas principais + storage `documentos-validacao` |
| 010 | `010_categorias_expandidas.sql` | Insere 50+ categorias reais (Pedreiro, Eletricista, Designer, etc.) |
| 011 | `011_carteira_e_saques.sql` | Tabelas `wallets`, `wallet_transactions`, `saques` (RF15–RF17) |
| 012 | `012_demandas_aceitar_recusar.sql` | Tabela `demanda_recusas` + fluxo aceitar/recusar demanda |
| 013 | `013_chat_atendimento_e_lock_demanda.sql` | Tabela `mensagens_atendimento` + lock atômico em demanda (só 1 prestador pode aceitar) |
| 014 | `014_realtime_mensagens.sql` | Habilita Supabase Realtime para `mensagens_atendimento` |
| 015 | `015_busca_publica_prestadores.sql` | Policy `profiles_select_prestadores_publicos` (lista todos prestadores) |
| 016 | `016_avaliacoes_denuncias_bloqueios_estado.sql` | Tabelas `avaliacoes`, `denuncias`, `bloqueios` + coluna `estado` em profiles (RF46+, RF52, RF53) |
| 017 | `017_propostas_e_escolha.sql` | Status `suplente` no enum proposta (RN07), trigger sync demanda↔solicitacao |
| 018 | `018_etapas_atendimento.sql` | Tabelas `etapas_tipos`, `etapas_atendimento`, `agendamento_propostas`, `cancelamento_etapas` + trigger automático de criação de etapas quando atendimento vira `aceita` (RF30–RF38) |
| 019 | `019_financeiro_rf39_46.sql` | Tabelas `config_financeiro`, `pagamentos`, `comissao_por_categoria`, `disputas`, RPCs Pix sandbox |
| 020 | `020_rf39_46_extensoes.sql` | Notificações financeiras, audit log, wallet_withdrawals, escrow legal, função `fn_avaliacao_criar_pos_etapa` |
| 021 | `021_financeiro_producao_perfeito.sql` | Escrow 48h, webhook idempotency, auditoria encadeada, snapshots de balance, payment_methods, fiscal_recibos, reembolso, rate limit |
| 022 | `022_pagamentos_plano.sql` | Tabela `pagamentos_plano` (Pix Mercado Pago para mudança de plano — RF07) |
| 023 | `023_fix_trigger_status_solicitacao.sql` | **Fix crítico:** trigger `trigger_criar_etapas_na_aceicao` referenciava o type `public.status_solicitacao` que **nunca foi criado**. Causa erro `type does not exist` em qualquer INSERT/UPDATE em `solicitacoes`. A coluna é `TEXT`, então o cast foi removido |
| 024 | `024_prestador_ve_cliente_do_atendimento.sql` | Policy `profiles_select_via_atendimento` — permite ambos os participantes de uma solicitação lerem o perfil um do outro (resolve "Sem nome" no detalhe do atendimento do prestador) |

> **Importante:** as migrations 023 e 024 só foram aplicadas localmente. Para o ambiente Supabase de produção, o usuário precisa rodar os scripts manualmente no SQL Editor.

### Principais tabelas

#### `profiles` — perfil do usuário
- `id` (uuid, FK `auth.users`)
- `nome`, `email`, `telefone`
- `tipo` (`cliente` / `profissional` / `administrador`)
- `cidade`, `estado` (UF, 2 chars)
- `avatar_url` (bucket público)
- `bio` (descrição)
- `experiencia_anos`, `historico_profissional`
- `plano` (`free` / `basico` / `premium`) + `plano_atualizado_em`
- `score_prioridade_busca` (cálculo de relevância em buscas)
- `created_at`

#### `categorias` — catálogo global
- `id`, `nome` (Pedreiro, Eletricista, Encanador, Faxineiro, etc.)

#### `profissional_categorias` — N:N entre profissional e categoria
- `profissional_id`, `categoria_id`

#### `servicos` — catálogo individual do prestador
- `id`, `profissional_id`, `categoria_id`, `titulo`, `descricao`, `valor_referencia`

#### `demandas` — pedido público do cliente
- `id`, `cliente_id`, `categoria_id`, `titulo`, `descricao`
- `status`: `aberta` / `em_andamento` / `concluida` / `cancelada`
- Quando o cliente escolhe uma proposta, vira `em_andamento` (some das listas de prestadores)

#### `propostas` — proposta de prestador para demanda
- `id`, `demanda_id`, `profissional_id`, `mensagem`, `valor_proposto`, `prazo`
- `status`: `pendente` / `aceita` / `recusada` / `suplente`
- Unique (demanda_id, profissional_id)

#### `solicitacoes` — **atendimento** (entidade central)
- `id`, `cliente_id`, `profissional_id`, `titulo`, `descricao`
- `status`: `pendente` / `aceita` / `em_andamento` / `concluida` / `cancelada` / `recusada` (coluna TEXT)
- `demanda_origem_id` (FK opcional para demanda) — quando vem do fluxo de proposta
- `proposta_origem_id` (FK opcional para proposta) — para rastrear qual proposta originou
- `valor_total_servico` (numeric, definido pelo prestador no card "Valor total")

#### `mensagens_atendimento` — chat
- `id`, `solicitacao_id`, `autor_id`, `texto`, `created_at`
- Realtime habilitado

#### `etapas_atendimento` — etapas formais (RN19+)
- `id`, `solicitacao_id`, `tipo` (vistoria, orcamento, agendamento, execucao, conclusao), `sequencia`
- `status`: enum `status_etapa` (`pendente` / `agendada` / `em_progresso` / `concluida` / `cancelada`)
- `valor_acordado` (divisão automática do `valor_total_servico` entre etapas)
- `cliente_confirmou`, `profissional_confirmou` (RN25 — aceite mútuo)

#### `pagamentos` — Pix por etapa
- `id`, `solicitacao_id`, `etapa_id`, `cliente_id`, `profissional_id`
- `valor_bruto`, `valor_etapa`, `comissao_percentual`, `valor_comissao`, `valor_liquido_prestador`
- `metodo` (pix), `status`: `aguardando_pagamento` / `pago` / `em_escrow` / `liberado` / `contestado` / `cancelado` / `reembolsado`
- `pix_copia_e_cola`, `pix_txid`, `pix_payload_hash`, `pix_expira_em`
- `pago_em`, `liberacao_agendada_em` (now + 48h após etapa concluída e ambos confirmaram), `liberado_em`

#### `pagamentos_plano` — assinatura via Mercado Pago
- `id`, `user_id`, `plano_alvo`, `valor`
- `mp_payment_id`, `mp_qr_code_base64`, `mp_pix_copia_e_cola`, `mp_expires_at`
- `status`: `aguardando_pix` / `aprovado` / `cancelado` / `expirado`
- Trigger atualiza `profiles.plano` quando webhook confirma pagamento

#### `wallets` + `wallet_transactions` + `saques` — carteira do prestador
- Saldo só entra via liberação de pagamento de etapa
- Prestador solicita saque (mínimo configurável em `config_financeiro`)
- Anti-fraude: bloqueio temporário em `wallet_locks`, scheduled_withdrawals (S1 — agendamento de saques grandes)

#### `avaliacoes`
- `id`, `atendimento_id`, `avaliador_id`, `avaliado_id`
- `nota` (1–5), `comentario`
- `nota_qualidade`, `nota_prazo`, `nota_comunicacao` (apenas cliente → prestador)
- `resposta_prestador` (texto, RF46.5 — réplica única)
- `bloqueio_edicao_ate` (RF46.3 — sem reedição após 7 dias)
- Unique (atendimento_id, avaliador_id) — cada um avalia 1x
- RLS: SELECT público para autenticados (alimentar perfil); INSERT só de participante avaliando contraparte de atendimento concluído

#### `denuncias`, `bloqueios` — moderação
- Cliente ou prestador pode denunciar (motivo + descrição) ou bloquear contraparte
- Bloqueado some das listas

#### Tabelas auxiliares (financeiro produção)
- `config_financeiro` — taxa de comissão padrão, limites, valor mínimo de saque, etc.
- `comissao_por_categoria` — override por categoria
- `disputas` — fluxo formal de contestação com prazos
- `audit_chain` — log encadeado de operações sensíveis
- `webhook_idempotency_keys`, `webhook_dead_letter` — robustez do webhook
- `fiscal_recibos`, `reembolso_pedidos` — fluxo fiscal
- `wallet_balance_snapshots` — auditoria de saldo
- `pix_generation_ratelimit` — anti-spam

### Enums importantes
- `tipo_usuario`: `cliente` / `profissional` / `administrador`
- `plano_usuario`: `free` / `basico` / `premium`
- `status_proposta`: `pendente` / `aceita` / `recusada` / `suplente`
- `status_etapa`: `pendente` / `agendada` / `em_progresso` / `concluida` / `cancelada`
- `solicitacoes.status` é **TEXT** (não enum) — valores convencionais: `pendente` / `aceita` / `em_andamento` / `concluida` / `cancelada` / `recusada`

---

## 5. Autenticação e autorização

### Fluxo de cadastro
1. Usuário em `/cadastro` informa: tipo (cliente/prestador), nome, telefone, e-mail, senha
2. Supabase Auth chama `signUp` com `raw_user_meta_data = { nome, telefone, tipo }`
3. Trigger SQL `on_auth_user_created` (migration 006) cria a linha em `profiles` automaticamente
4. Confirmação por OTP de 8 dígitos enviado por e-mail
5. Usuário cola o código em `/verificar` → `verifyOtp({ type: 'email' })`
6. Após confirmar, redireciona para `/cliente/inicio`, `/profissional/inicio` ou `/admin/inicio` conforme `tipo`

### Middleware (`src/middleware.ts`)
- Roda em todas as rotas (exceto estáticas)
- Usa `@supabase/ssr` com `createServerClient` e propaga cookies
- Bloqueia rotas `/cliente/`, `/profissional/`, `/admin/` se `user === null` → redirect `/entrar`

### Recuperação de senha
- `/recuperar-senha` → envia e-mail com link mágico
- `/nova-senha` → atualiza senha do user autenticado pelo link

### Row Level Security (RLS)
- Todas as tabelas têm RLS ativo
- Policies usam `auth.uid()` para filtrar
- `is_administrator()` é função SECURITY DEFINER que checa `tipo='administrador'`
- Função SECURITY DEFINER usada em RPCs financeiras para fazer inserções em tabelas com RLS sem expor service_role

---

## 6. Planos e limites (regras de negócio)

### Preços (src/lib/planos-precos.ts)
```ts
PRECOS_PLANO = {
  cliente:      { free: 0, basico: R$ 0,50, premium: R$ 1,00 },
  profissional: { free: 0, basico: R$ 0,50, premium: R$ 1,50 },
  administrador: { free: 0, basico: 0, premium: 0 },
}
```

> Valores baixos porque o Mercado Pago exige Pix ≥ R$ 0,50 em sandbox/teste. Em produção real, multiplicar.

### Limites (src/lib/plano-limites.ts)

| Limite | Free | Básico | Premium |
|---|---|---|---|
| **CLIENTE** | | | |
| Pode publicar demanda | ❌ (RN02) | ✅ | ✅ |
| Demandas ativas | 0 | 2 (RN04) | 999 (RN32) |
| Propostas visíveis por demanda | 0 | 2 (RN06) | 5 |
| Negociações fora de demanda | 1 (RN08) | 5 | 999 |
| Atendimentos simultâneos | 1 | 2 (RN09) | 5 (RN10) |
| **PRESTADOR** | | | |
| Categorias | 0 (RN11) | 2 (RN12) | 999 |
| Serviços catálogo | 0 | 3 (RN13) | 999 |
| Atendimentos simultâneos | 0 | 2 (RN14) | 6 (RN15) |
| Propostas simultâneas | 0 | 1 (RN16) | 3 |
| Pode aceitar demandas | ❌ | ✅ | ✅ |
| Pode enviar propostas | ❌ | ✅ | ✅ |

### Nomenclatura UI
- `free` → "Free"
- `basico` → "Pro"
- `premium` → "Premium Pro"

---

## 7. Fluxos detalhados

### Fluxo 1 — Contratação direta
1. Cliente em `/cliente/buscar` filtra por categoria/cidade/estado/nota
2. Toca em "Ver perfil" → abre `PerfilModal` (nome, foto, categorias, avaliação, atendimentos, currículo, **avaliações públicas recebidas**)
3. Toca em "Solicitar serviço" → modal com título + descrição → cria `solicitacoes` com `status='aceita'`
4. Prestador vê em `/profissional/solicitacoes` → aceita ou recusa
5. Se aceitar, vira atendimento (mesmo fluxo do 2)

### Fluxo 2 — Demanda pública com propostas
1. Cliente em `/cliente/demandas` publica demanda (categoria, título, descrição) — RN02–RN05 (limites por plano)
2. Prestadores compatíveis veem em `/profissional/demandas`
3. Prestador envia proposta (mensagem + valor + prazo) — RN16 (limite por plano)
4. Cliente em `/cliente/demandas/[id]` vê propostas (limitado a `maxPropostasPorDemanda` do plano)
5. Cliente abre modal "Confirmar escolha" → cria `solicitacoes` com `proposta_origem_id`, `demanda_origem_id`, `valor_total_servico = proposta.valor_proposto`
6. Trigger SQL `sync_status_demanda_via_solicitacao` muda demanda para `em_andamento`
7. Demais propostas viram `suplente` (RN07)
8. Atendimento criado segue para o fluxo 3
9. Cliente pode **editar** ou **excluir** demanda enquanto `status='aberta'` e não há proposta aceita

### Fluxo 3 — Atendimento em execução
1. Prestador entra em `/profissional/atendimentos/[id]` → vê detalhes, status, perfil do cliente
2. Trigger `trigger_criar_etapas_na_aceicao` cria etapas padrão automaticamente quando atendimento vira `aceita`:
   - Vistoria/Consulta (opcional, RN19)
   - Orçamento
   - Agendamento (aceite mútuo, RN25)
   - Execução
   - Conclusão
3. Prestador define o **valor total do serviço** → divide automaticamente entre as 3 etapas pagáveis (vistoria/orçamento/execução)
4. Para cada etapa:
   - Cliente propõe data/horário (`agendamento_propostas`)
   - Prestador aceita → etapa vira `agendada`
   - Cliente paga via Pix da plataforma → entra em escrow
   - Etapa executada → ambos confirmam → após 48h → repasse cai na carteira do prestador
5. Última etapa concluída e liberada → cliente avalia prestador (RF46) → prestador responde réplica (RF46.5, opcional)
6. Após conclusão, **prestador também avalia o cliente** (RF47 — novo)

### Fluxo financeiro (Pix de etapa)
1. Cliente vê `PagamentoEtapaPanel` na etapa pagável
2. Aceita termos de escrow → clica "Pagar etapa com Pix"
3. RPC `fn_financeiro_criar_pagamento_pix(etapa_id, escrow_terms_accepted=true, terms_version, ...)`
4. Função valida:
   - Etapa existe e está em status pagável
   - Cliente é o avaliador (`auth.uid() = solicitacao.cliente_id`)
   - Valor não excede `valor_max_etapa_sem_revisao` (default R$ 15.000)
   - Rate limit (10 Pix/min por user)
   - Não há pagamento ativo na etapa
5. Calcula comissão (`fn_comissao_percentual_para_solicitacao` — usa override de categoria ou padrão)
6. Gera Pix sandbox (payload BR Code) e insere em `pagamentos` com status `aguardando_pagamento`
7. Cliente paga → função `fn_financeiro_confirmar_pix_sandbox` muda para `em_escrow`
8. Etapa concluída + ambos confirmaram → `liberacao_agendada_em = now() + 48h`
9. Job (ou hit manual) processa liberações vencidas → debita `valor_liquido_prestador` em `wallets.saldo_bloqueado` → libera para `saldo`
10. Prestador solicita saque em `/profissional/carteira` → vira `saques` com status `pendente` → admin aprova → desconta saldo

### Fluxo de mudança de plano (Pix Mercado Pago)
1. Usuário em `/cliente/configuracoes/plano` ou `/profissional/configuracoes/plano` escolhe plano e clica "Pagar com Pix"
2. Frontend chama `POST /api/pix/plano/criar` com `{ plano }`
3. API server-side:
   - Cria registro em `pagamentos_plano` com `status='aguardando_pix'`
   - Chama `POST https://api.mercadopago.com/v1/payments` com token de produção
   - Salva `mp_payment_id`, `qr_code_base64`, `pix_copia_e_cola`, `expires_at` no registro
   - Retorna QR code + copia-e-cola pro front
4. Front mostra `PagarPlanoModal` com QR/Pix copia-e-cola
5. Front faz polling em `GET /api/pix/plano/status?id=...` a cada 5s
6. Mercado Pago envia webhook em `POST /api/webhooks/mercado-pago`:
   - Valida HMAC-SHA256 com `MERCADO_PAGO_WEBHOOK_SECRET`
   - Idempotência via `webhook_idempotency_keys`
   - Marca pagamento como `aprovado` → trigger atualiza `profiles.plano`
7. Polling retorna confirmação → modal mostra ✓ e fecha

---

## 8. Requisitos funcionais implementados

### Status atual (alta confiança — código auditado)

| RF | Descrição | Status | Onde |
|---|---|---|---|
| RF01 | Cadastro de usuários | ✅ | `/cadastro` + trigger `on_auth_user_created` |
| RF02 | Login e logout | ✅ | `/entrar`, botão sair em `/configuracoes` |
| RF03 | Recuperação de acesso | ✅ | `/recuperar-senha`, `/nova-senha` |
| RF04 | Diferenciar perfis | ✅ | enum `tipo_usuario`, middleware redireciona por tipo |
| RF05 | Editar perfil | ✅ | `/cliente/configuracoes/conta`, idem profissional |
| RF06 | Foto de perfil | ✅ | bucket `avatars`, upload em `/configuracoes/conta` |
| RF07 | Controle de plano (com Pix real) | ✅ | `/cliente/configuracoes/plano`, MP webhook |
| RF08 | Profissional cadastra categorias | ✅ | `/profissional/servicos` |
| RF09–RF11 | Serviços, valor de referência, validação | ✅ | tabela `servicos`, `documentos_validacao` |
| RF12 | Cliente busca prestador | ✅ | `/cliente/buscar` |
| RF13 | Cliente solicita serviço direto | ✅ | botão "Solicitar serviço" no perfil |
| RF14 | Prestador aceita/recusa solicitação direta | ✅ | `/profissional/solicitacoes` |
| RF15 | Atendimento ativo | ✅ | tabela `solicitacoes` com status `aceita`/`em_andamento` |
| RF16 | Carteira interna | ✅ | tabela `wallets`, `/profissional/carteira` |
| RF17 | Solicitar saque | ✅ | tabela `saques`, fluxo anti-fraude S1 |
| RF18 | Publicar demanda pública | ✅ | `/cliente/demandas` |
| RF19 | Limite de demandas por plano | ✅ | RN02–RN05, `plano-limites.ts` |
| RF20 | Prestador vê demandas compatíveis | ✅ | `/profissional/demandas` (filtra por categoria e exclui recusadas/aceitas) |
| RF21–RF24 | Propostas (criar, listar, limitar) | ✅ | tabela `propostas`, limite por plano |
| RF25 | Cliente compara propostas | ✅ | `/cliente/demandas/[id]` |
| RF26 | Cliente escolhe prestador | ✅ | modal de confirmação (no tema do app, não confirm() do browser) |
| RF27 | Demais propostas viram suplente | ✅ | trigger SQL muda status para `suplente` |
| RF28 | Limite de atendimentos simultâneos | ✅ | validação em `escolherProposta` |
| RF29 | Chat por atendimento | ✅ | `ChatAtendimento.tsx` + Realtime |
| RF30–RF38 | Etapas (vistoria, orçamento, agendamento, execução, conclusão) | ✅ | `GerenciadorEtapas.tsx`, `CardEtapa.tsx`, `AgendamentoModal.tsx`, `ConfirmacaoEtapaModal.tsx` |
| RF39–RF42 | Pix sandbox por etapa + comissão | ✅ | `PagamentoEtapaPanel.tsx`, RPC `fn_financeiro_criar_pagamento_pix` |
| RF43 | Comissão automática | ✅ | RPC calcula e separa |
| RF44 | Repasse para carteira do prestador | ✅ | escrow + liberação 48h |
| RF45 | Retenção em disputa | ✅ | tabela `disputas` + status `contestado` |
| RF46 | Avaliação cliente → prestador | ✅ | `AvaliarPrestadorCard.tsx`, RPC `fn_avaliacao_criar_pos_etapa` |
| **RF47** | Avaliação prestador → cliente | ✅ **novo** | `AvaliarClienteCard.tsx` no detalhe do atendimento do prestador |
| **RF48** | Comentários sobre o atendimento | ✅ **novo** | Lista no `PerfilModal` |
| **RF49** | Reputação pública dos usuários | ✅ **novo** | Seção "Avaliações recebidas" no `PerfilModal` |
| RF50–RF51 | Taxa de aceite/cancelamento | ⚠️ Parcial | Score calculado, sem UI dedicada |
| RF52 | Bloqueio entre usuários | ✅ | tabela `bloqueios`, botão "Bloquear" no `PerfilModal` |
| RF53 | Denúncias | ✅ | tabela `denuncias`, form no `PerfilModal` |
| RF54–RF55 | Verificação de perfil + selo | ⚠️ Parcial | Upload de documento em `/profissional/configuracoes/validacao`, sem fluxo admin para aprovar |
| RF56–RF64 | Restantes (notificações, admin, etc.) | Parcial | Algumas notificações financeiras existem, admin tem dashboard básico |

### Regras de negócio críticas

- **RN18:** toda negociação financeira exclusivamente dentro da plataforma → Pix da MaoCerta, aviso no UI
- **RN19:** pagamento da vistoria só após confirmação da etapa → check em `etapa.status in ('agendada','em_progresso')`
- **RN21:** etapas já executadas devem ser pagas → escrow garante isso
- **RN23:** disputa → valor retido até análise → status `contestado`
- **RN24:** prestador não pode inserir saldo manualmente → wallet só recebe via liberação
- **RN25:** agendamento só confirmado com aceite mútuo → `cliente_confirmou && profissional_confirmou`
- **RN29:** muitas recusas impactam reputação → `score_prioridade_busca`
- **RN31:** prestador só atua após validação completa → check em UI (não bloqueio rígido ainda)
- **RN34:** pagamento liberado apenas após confirmação → escrow + 48h

---

## 9. Tema claro/escuro

### Implementação
- `ThemeProvider` em `src/components/providers/` injeta classe `dark` em `<html>` baseado em localStorage
- `tailwind.config.ts` com `darkMode: 'class'`
- `globals.css`:
  - `html { color-scheme: light }` / `html.dark { color-scheme: dark }` — garante que controles nativos (selects, scrollbars, date pickers) sigam o tema
  - Utility classes: `.input-padrao`, `.select-padrao`, `.card-padrao`, `.btn-primario`, `.btn-secundario`, `.btn-perigo`
- `BarraTopoApp.tsx` — 2 botões circulares flutuantes (top-right): alternar tema, abrir alertas

### Convenção de cores
| Token | Light | Dark |
|---|---|---|
| Card | `bg-white` | `dark:bg-slate-900` |
| Surface 2 (input/badge) | `bg-gray-50/100` | `dark:bg-slate-800` |
| Border | `border-gray-100/200` | `dark:border-slate-800/700` |
| Texto título | `text-gray-900` | `dark:text-slate-100` |
| Texto corpo | `text-gray-600/700` | `dark:text-slate-300/400` |
| Texto fraco | `text-gray-400/500` | `dark:text-slate-500/400` |
| Placeholder | `placeholder:text-gray-400` | `dark:placeholder:text-slate-500` |

### Padrões de contraste
- `bg-X-50` (claro fixo) sempre usado com `dark:bg-X-950/40` (escuro translúcido) + texto `X-900 dark:X-200`
- Nunca usar `text-gray-900 dark:text-slate-100` em cima de `bg-X-50` sem dark (texto sumia em dark)

---

## 10. Sessão atual — o que foi feito (2026-05-20)

### Commits da sessão (do mais recente ao mais antigo)
- `5cb09b8` — RF47/RF48/RF49: avaliação bilateral e reputação pública
- `de8835c` — Propostas ativas desconsideram atendimentos cancelados/concluídos
- `d09c168` — Categorias do prestador no PerfilModal
- `756eec6` — Migration 024 (prestador vê cliente) + erro de Pix expõe motivo
- `dd4c191` — Migration 023 (fix trigger) + modal de confirmação ao escolher prestador + editar/excluir demanda
- `4c9a6bc` — Script SQL para colocar todos no plano premium
- `7934715` — Remove seção "outras pessoas buscando" + script de limpeza
- `a99ecad` — Legibilidade dos cards VALOR/PRAZO + dedup dark
- `cabfa4b` — Dropdown UF, card de demanda, modal de perfil, tela de demanda
- `ffff4ac` — Fix aspas escapadas no PagarPlanoModal (eslint do Vercel)
- `240323e` — Padronização de contraste claro/escuro em todo o app
- `144eef9` — Pagamento de plano via Pix com Mercado Pago

### Estado do banco de produção
- Todos os perfis estão no plano `premium` (script `todos-plano-premium.sql` aplicado)
- Tabelas transacionais foram limpas via `limpar-dados-transacionais.sql` (manteve 7 logins + perfis básicos)
- **Migrations 023 e 024 NÃO foram aplicadas ainda no Supabase de produção** — usuário precisa rodar manualmente no SQL Editor

---

## 11. Como continuar

### Para aplicar as últimas migrations no Supabase
1. Abrir Supabase Studio → SQL Editor
2. Colar conteúdo de `supabase/migrations/023_fix_trigger_status_solicitacao.sql` → Run
3. Colar conteúdo de `supabase/migrations/024_prestador_ve_cliente_do_atendimento.sql` → Run

### Para testar o app
- URL produção: deploy automático do Vercel a partir do `main`
- Loga com qualquer dos 7 perfis preservados
- Fluxo recomendado de demo (5 min):
  1. Cliente publica demanda em `/cliente/demandas`
  2. Prestador (outro browser) vê em `/profissional/demandas`, envia proposta
  3. Cliente em `/cliente/demandas/[id]` escolhe o prestador via modal próprio
  4. Atendimento criado, etapas geradas automaticamente
  5. Prestador define valor total
  6. Cliente paga 1 etapa via Pix sandbox
  7. Ambos confirmam etapa → escrow libera em 48h
  8. Após concluir, ambos avaliam (cliente → prestador e prestador → cliente)
  9. Abrir perfil do outro lado → ver avaliações públicas

### Para apresentar para a professora
- Roteiro completo no documento `docs/PROJETO_COMPLETO.md` (este arquivo)
- Sugestão: rodar `limpar-dados-transacionais.sql` antes para zerar histórico de teste
- Mostrar 3 perfis em 3 abas: cliente, prestador, admin
- Demo do Pix real do plano (mostra Mercado Pago integrado de verdade)

---

## 12. Convenções de código

- **TypeScript estrito** — todas as tipagens explícitas, sem `any` sem motivo
- **Componentes "screen" vs "component"** — `src/screens/` para telas completas (com lógica), `src/components/` para reutilizáveis
- **Services em `src/lib/supabase/`** — wrappers tipados das chamadas Supabase, especialmente RPCs
- **Sem AI traces em commits** — convenção do projeto: nunca incluir "Co-Authored-By Claude", "Generated with Claude Code" etc.
- **Sempre perguntar antes de commitar** — convenção do usuário
- **Commits em português** — mensagens curtas, prefixo `feat:` / `fix:` / `chore:` / `ui:`

---

## 13. Pontos de atenção / dívida técnica

1. **Migrations 023 e 024 pendentes em produção** — aplicar manualmente
2. **Fluxo admin de validação de prestador** — UI de upload existe, mas não há tela admin para aprovar/rejeitar documentos (RF54–RF55 incompleto)
3. **Notificações in-app** — botão de sino existe na BarraTopoApp, mas o dropdown só lista mensagens financeiras
4. **Etapas pagáveis vs não-pagáveis** — apenas vistoria/orçamento/execução têm divisão de valor; agendamento e conclusão não pagam
5. **Realtime só em mensagens** — outras tabelas (etapas, pagamentos) precisam refresh manual ou polling
6. **`solicitacoes.status` é TEXT, não enum** — historicamente, scripts SQL antigos tentaram fazer cast para `status_solicitacao` (type inexistente) e quebraram. Migration 023 corrige a trigger
7. **Mercado Pago em produção** — `MERCADO_PAGO_ACCESS_TOKEN` é de produção real. Preços baixos (R$ 0,50–1,50) por isso

---

## 14. Quick reference — arquivos importantes

| Quero entender... | Olhe em |
|---|---|
| Fluxo de auth | `src/middleware.ts`, `src/screens/EntrarScreen.tsx`, `src/app/api/` |
| Tema dark/light | `src/app/globals.css`, `src/components/app/BarraTopoApp.tsx` |
| Pagamento Pix etapa | `src/components/financeiro/PagamentoEtapaPanel.tsx`, migration 019/020/021 |
| Pagamento Pix plano (MP) | `src/app/api/pix/plano/criar/route.ts`, `src/components/financeiro/PagarPlanoModal.tsx` |
| Webhook MP | `src/app/api/webhooks/mercado-pago/route.ts` |
| Demanda + proposta | `src/screens/cliente/ClienteDemandasScreen.tsx`, `src/screens/cliente/ClienteDemandaDetalheScreen.tsx`, `src/screens/profissional/ProfissionalDemandasScreen.tsx` |
| Atendimento + etapas | `src/screens/profissional/ProfissionalAtendimentoDetalheScreen.tsx`, `src/components/etapas/` |
| Chat | `src/screens/atendimento/ChatAtendimento.tsx`, migration 014 |
| Perfil + reputação | `src/screens/perfil/PerfilModal.tsx` |
| Limites e preços de plano | `src/lib/plano-limites.ts`, `src/lib/planos-precos.ts` |
| Limpar banco para demo | `supabase/scripts/limpar-dados-transacionais.sql` |
| Promover todos a Premium | `supabase/scripts/todos-plano-premium.sql` |

---

**Fim do documento.** Para perguntas sobre qualquer componente, ler o arquivo correspondente no path indicado. O projeto está versionado no Git — `git log -p <arquivo>` mostra a evolução. Migrations Supabase são idempotentes (`if not exists`, `drop policy if exists`), seguras de re-rodar.
