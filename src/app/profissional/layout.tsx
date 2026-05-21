import MenuInferiorProfissional from '@/screens/profissional/MenuInferiorProfissional'
import MenuSuperior from '@/components/app/MenuSuperior'
import BarraTopoApp from '@/components/app/BarraTopoApp'

export default function ProfissionalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen pb-20 lg:pb-0 bg-gray-50 dark:bg-slate-950">
      <MenuSuperior papel="profissional" />
      <BarraTopoApp variant="profissional" />
      {children}
      <MenuInferiorProfissional />
    </div>
  )
}
