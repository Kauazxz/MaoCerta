import MenuInferiorProfissional from '@/screens/profissional/MenuInferiorProfissional'
import BarraTopoApp from '@/components/app/BarraTopoApp'

export default function ProfissionalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen pb-20 bg-gray-50 dark:bg-slate-950">
      <BarraTopoApp variant="profissional" />
      {children}
      <MenuInferiorProfissional />
    </div>
  )
}
