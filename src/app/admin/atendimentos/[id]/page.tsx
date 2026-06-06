import AdminAtendimentoDetalheScreen from '@/screens/admin/AdminAtendimentoDetalheScreen'

export default async function AdminAtendimentoDetalhe({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <AdminAtendimentoDetalheScreen solicitacaoId={id} />
}
