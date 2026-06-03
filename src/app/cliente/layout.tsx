import MenuInferiorCliente from '@/screens/cliente/MenuInferiorCliente'
import BarraTopoApp from '@/components/app/BarraTopoApp'
import { AppRealtimeProvider } from '@/components/providers/AppRealtimeProvider'

export default function ClienteLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppRealtimeProvider papel="cliente">
      <div className="min-h-screen pb-20 bg-gray-50 dark:bg-slate-950">
        <BarraTopoApp variant="cliente" />
        {children}
        <MenuInferiorCliente />
      </div>
    </AppRealtimeProvider>
  )
}
