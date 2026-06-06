import AtendimentoNovoScreen from '@/screens/atendimento-novo/AtendimentoNovoScreen'

export default function Page({ params }: { params: { id: string } }) {
  return <AtendimentoNovoScreen solicitacaoId={params.id} perfil="cliente" />
}
