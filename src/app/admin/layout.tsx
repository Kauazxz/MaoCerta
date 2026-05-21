import MenuInferiorAdmin from '@/screens/admin/MenuInferiorAdmin'
import MenuSuperior from '@/components/app/MenuSuperior'
import BarraTopoApp from '@/components/app/BarraTopoApp'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen pb-20 lg:pb-0 bg-gray-50 dark:bg-slate-950">
      <MenuSuperior papel="admin" />
      <BarraTopoApp variant="admin" />
      {children}
      <MenuInferiorAdmin />
    </div>
  )
}
