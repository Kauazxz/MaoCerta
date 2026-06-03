import MenuInferiorProfissional from '@/screens/profissional/MenuInferiorProfissional'
import BarraTopoApp from '@/components/app/BarraTopoApp'
import { AppRealtimeProvider } from '@/components/providers/AppRealtimeProvider'

export default function ProfissionalLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppRealtimeProvider papel="profissional">
      <div className="min-h-screen pb-20 bg-gray-50 dark:bg-slate-950">
        <BarraTopoApp variant="profissional" />
        {children}
        <MenuInferiorProfissional />
      </div>
    </AppRealtimeProvider>
  )
}
