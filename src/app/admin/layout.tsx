import MenuInferiorAdmin from '@/screens/admin/MenuInferiorAdmin'
import BarraTopoApp from '@/components/app/BarraTopoApp'
import { AppRealtimeProvider } from '@/components/providers/AppRealtimeProvider'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppRealtimeProvider papel="administrador">
      <div className="min-h-screen pb-20 bg-gray-50 dark:bg-slate-950">
        <BarraTopoApp variant="admin" />
        {children}
        <MenuInferiorAdmin />
      </div>
    </AppRealtimeProvider>
  )
}
