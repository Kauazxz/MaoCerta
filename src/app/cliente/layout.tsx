import MenuInferiorCliente from '@/screens/cliente/MenuInferiorCliente'
import MenuSuperior from '@/components/app/MenuSuperior'
import BarraTopoApp from '@/components/app/BarraTopoApp'

export default function ClienteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen pb-20 lg:pb-0 bg-gray-50 dark:bg-slate-950">
      <MenuSuperior papel="cliente" />
      <BarraTopoApp variant="cliente" />
      {children}
      <MenuInferiorCliente />
    </div>
  )
}
