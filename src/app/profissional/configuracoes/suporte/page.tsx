import SuporteScreen from '@/screens/configuracoes/SuporteScreen'

const FAQ = [
  {
    pergunta: 'Como recebo o pagamento dos serviços?',
    resposta:
      'O cliente paga por etapa dentro da plataforma. O valor fica retido até ele confirmar a conclusão da etapa, e então é repassado para sua conta bancária cadastrada. No plano Premium Pro o repasse é em até 24h.',
  },
  {
    pergunta: 'Como aparecer mais nas buscas?',
    resposta:
      'Mantenha boa nota, alta taxa de resposta, perfil completo (foto, descrição e categorias) e considere assinar o plano Pro ou Premium Pro para destaque nos resultados.',
  },
  {
    pergunta: 'Posso recusar uma demanda?',
    resposta:
      'Pode. Recusar uma demanda não afeta sua reputação, mas ignorar mensagens de clientes derruba sua taxa de resposta — o que prejudica seu posicionamento na busca.',
  },
  {
    pergunta: 'Como funcionam as avaliações?',
    resposta:
      'Após a conclusão de cada serviço, o cliente pode te dar uma nota de 1 a 5 estrelas e um comentário. As avaliações ficam públicas no seu perfil e influenciam diretamente sua visibilidade.',
  },
  {
    pergunta: 'O que fazer se um cliente abrir uma disputa?',
    resposta:
      'O valor da etapa em disputa fica retido. Você terá um prazo para apresentar provas (fotos, conversas, comprovantes). A equipe de moderação avalia em até 48h e decide o repasse.',
  },
  {
    pergunta: 'Posso pausar minha conta temporariamente?',
    resposta:
      'Sim. Em Privacidade e Segurança, desative "Perfil visível na busca". Você para de receber novas demandas mas continua com os atendimentos em andamento.',
  },
]

const CANAIS = [
  { icone: '💬', titulo: 'Chat com a equipe', descricao: 'Resposta em até 1 hora em horário comercial', acao: 'Abrir chat' },
  { icone: '✉️', titulo: 'E-mail', descricao: 'prestadores@maocerta.com', acao: 'Enviar e-mail' },
  { icone: '📞', titulo: 'WhatsApp prioritário', descricao: 'Disponível para prestadores Premium Pro', acao: 'Abrir WhatsApp' },
]

export default function SuportePage() {
  return (
    <SuporteScreen
      voltarHref="/profissional/configuracoes"
      faq={FAQ}
      canais={CANAIS}
      tema="prestador"
      chatSuporte="usuario"
      destaque={{
        titulo: 'Suporte ao prestador',
        descricao: 'Tire dúvidas sobre repasse, disputas e visibilidade. As perguntas mais comuns estão abaixo.',
      }}
    />
  )
}
