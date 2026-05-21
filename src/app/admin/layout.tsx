import MenuInferiorAdmin from '@/screens/admin/MenuInferiorAdmin'
import BarraTopoApp from '@/components/app/BarraTopoApp'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen pb-20 bg-gray-50 dark:bg-slate-950">
      <BarraTopoApp variant="admin" />
      {children}
      <MenuInferiorAdmin />
    </div>
  )
}
