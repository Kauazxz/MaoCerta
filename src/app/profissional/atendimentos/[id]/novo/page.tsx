import AtendimentoNovoScreen from '@/screens/atendimento-novo/AtendimentoNovoScreen'

export default async function ProfissionalAtendimentoNovo({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <AtendimentoNovoScreen solicitacaoId={id} perfil="profissional" />
}
