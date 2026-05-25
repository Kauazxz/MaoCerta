import AdminUsuarioDetalheScreen from '@/screens/admin/AdminUsuarioDetalheScreen'

export default async function AdminUsuarioDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AdminUsuarioDetalheScreen id={id} />
}
