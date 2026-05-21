import MenuInferiorCliente from '@/screens/cliente/MenuInferiorCliente'
import BarraTopoApp from '@/components/app/BarraTopoApp'

export default function ClienteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen pb-20 bg-gray-50 dark:bg-slate-950">
      <BarraTopoApp variant="cliente" />
      {children}
      <MenuInferiorCliente />
    </div>
  )
}
