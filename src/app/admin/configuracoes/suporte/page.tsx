import SuporteScreen from '@/screens/configuracoes/SuporteScreen'

const FAQ = [
  {
    pergunta: 'Como moderar uma denúncia?',
    resposta:
      'Acesse a aba Denúncias no menu inferior. Cada denúncia mostra o usuário denunciado, a parte queixosa, evidências anexadas e histórico do atendimento. Avalie e aplique a ação apropriada (advertência, suspensão temporária ou banimento).',
  },
  {
    pergunta: 'Como suspender um usuário?',
    resposta:
      'No painel de Usuários, busque pelo e-mail ou nome, abra o perfil e use "Suspender conta". Defina a duração e o motivo — o usuário receberá notificação automática.',
  },
  {
    pergunta: 'Como ajustar a comissão da plataforma?',
    resposta:
      'A comissão padrão é definida nas configurações globais (acesso restrito a administradores). Mudanças são versionadas e exigem confirmação em duas etapas.',
  },
  {
    pergunta: 'O que faço em caso de fraude no pagamento?',
    resposta:
      'Bloqueie o saque do prestador imediatamente, retenha o valor da etapa em disputa e abra um chamado interno com a equipe financeira. Anexe todas as evidências antes de tomar qualquer outra ação.',
  },
  {
    pergunta: 'Quem tem acesso ao log de auditoria?',
    resposta:
      'Apenas administradores com permissão "Auditor" podem ver o log completo. Todas as suas ações ficam registradas com timestamp, IP e detalhes do que foi alterado.',
  },
]

const CANAIS = [
  { icone: '💬', titulo: 'Chat com usuários', descricao: 'Responda clientes e prestadores em tempo real', acao: 'Abrir chat' },
  { icone: '✉️', titulo: 'E-mail interno', descricao: 'admin@maocerta.com', acao: 'Enviar e-mail' },
  { icone: '🔐', titulo: 'Líder técnico', descricao: 'Para incidentes críticos de segurança', acao: 'Acionar' },
]

export default function SuportePage() {
  return (
    <SuporteScreen
      voltarHref="/admin/configuracoes"
      faq={FAQ}
      canais={CANAIS}
      tema="admin"
      chatSuporte="admin"
      destaque={{
        titulo: 'Procedimentos internos',
        descricao: 'Fluxos padrão de moderação, suspensão e tratamento de incidentes.',
      }}
    />
  )
}
