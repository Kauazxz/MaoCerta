import SwitcherAtendimento from '@/components/atendimento-novo/SwitcherAtendimento'

export default function Page({ params }: { params: { id: string } }) {
  return <SwitcherAtendimento solicitacaoId={params.id} perfil="profissional" />
}
