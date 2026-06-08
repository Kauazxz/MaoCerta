import SuporteScreen from '@/screens/configuracoes/SuporteScreen'

const FAQ = [
  {
    pergunta: 'Como funciona o pagamento por etapa?',
    resposta:
      'O pagamento é dividido nas etapas combinadas com o prestador. O valor só é liberado para ele depois que você confirma a conclusão de cada etapa.',
  },
  {
    pergunta: 'Posso negociar fora da plataforma?',
    resposta:
      'Não. Toda negociação financeira precisa acontecer dentro do MãoCerta. Isso garante seus direitos em caso de problema com o serviço.',
  },
  {
    pergunta: 'Como abrir uma disputa?',
    resposta:
      'Dentro do atendimento, abra a etapa em que houve problema e toque em "Abrir disputa". O valor fica retido até a equipe analisar.',
  },
  {
    pergunta: 'O que acontece se eu cancelar?',
    resposta:
      'Cancelar antes da execução não gera cobrança. Cancelar com etapas já executadas pode gerar cobrança proporcional ao que foi feito.',
  },
  {
    pergunta: 'Como denuncio um prestador?',
    resposta:
      'Acesse o perfil do prestador e toque em "Denunciar". Descreva o ocorrido e a equipe avaliará em até 48 horas.',
  },
]

const CANAIS = [
  { icone: '💬', titulo: 'Chat com a equipe', descricao: 'Resposta em até 1 hora em horário comercial', acao: 'Abrir chat' },
  { icone: '✉️', titulo: 'E-mail', descricao: 'suporte@maocerta.com', acao: 'Enviar e-mail' },
  { icone: '📞', titulo: 'WhatsApp', descricao: 'Disponível para clientes Premium Plus', acao: 'Abrir WhatsApp' },
]

export default function SuportePage() {
  return <SuporteScreen voltarHref="/cliente/configuracoes" faq={FAQ} canais={CANAIS} tema="cliente" chatSuporte="usuario" />
}
