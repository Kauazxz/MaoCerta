'use client'

import { useState, Suspense, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function FormularioVerificar() {
  const params = useSearchParams()
  const router = useRouter()
  const email = params.get('email') || ''

  const [codigo, setCodigo] = useState(['', '', '', '', '', '', '', ''])
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  function handleDigito(index: number, valor: string) {
    if (!/^\d*$/.test(valor)) return

    const novo = [...codigo]
    novo[index] = valor.slice(-1)
    setCodigo(novo)

    if (valor && index < 7) {
      inputs.current[index + 1]?.focus()
    }
  }

  function handleBackspace(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !codigo[index] && index > 0) {
      inputs.current[index - 1]?.focus()
    }
  }

  function handleColar(e: React.ClipboardEvent) {
    const texto = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 8)
    if (texto.length === 8) {
      setCodigo(texto.split(''))
      inputs.current[7]?.focus()
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const token = codigo.join('')
    if (token.length < 8) return

    setErro('')
    setCarregando(true)

    const supabase = createClient()

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    })

    if (error || !data.user) {
      setErro('Código inválido ou expirado. Tente novamente.')
      setCarregando(false)
      return
    }

    // Pega o tipo do usuário pra redirecionar pra área correta.
    // Tenta primeiro pelo profile (caso o trigger já tenha criado a linha);
    // se não, cai no metadata salvo no signUp.
    const { data: profile } = await supabase
      .from('profiles')
      .select('tipo')
      .eq('id', data.user.id)
      .maybeSingle()

    const tipo =
      profile?.tipo ||
      (data.user.user_metadata as { tipo?: string } | null)?.tipo ||
      'cliente'

    if (tipo === 'administrador') {
      router.replace('/admin/inicio')
    } else if (tipo === 'profissional') {
      router.replace('/profissional/inicio')
    } else {
      router.replace('/cliente/inicio')
    }
  }

  async function reenviarCodigo() {
    const supabase = createClient()
    await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: undefined } })
    setErro('Novo código enviado para o seu e-mail.')
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-purple-700 via-indigo-600 to-blue-400 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-xs space-y-6">

        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto text-3xl">
            📬
          </div>
          <h1 className="text-xl font-bold text-white">Verifique seu e-mail</h1>
          <p className="text-white/60 text-sm">
            Enviamos um código de 8 dígitos para{' '}
            <span className="text-white font-medium">{email}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex gap-2 justify-center">
            {codigo.map((digito, i) => (
              <input
                key={i}
                ref={el => { inputs.current[i] = el }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digito}
                onChange={(e) => handleDigito(i, e.target.value)}
                onKeyDown={(e) => handleBackspace(i, e)}
                onPaste={handleColar}
                className="w-11 h-14 bg-white/20 text-white text-xl font-bold text-center rounded-2xl outline-none focus:bg-white/35 transition-colors caret-transparent"
              />
            ))}
          </div>

          {erro && (
            <p className="text-red-300 text-xs text-center">{erro}</p>
          )}

          <button
            type="submit"
            disabled={codigo.join('').length < 8 || carregando}
            className="w-full bg-white dark:bg-slate-900 text-purple-700 font-semibold py-3 rounded-2xl text-sm hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {carregando ? 'Verificando...' : 'Confirmar código'}
          </button>
        </form>

        <p className="text-white/50 text-xs text-center">
          Não recebeu?{' '}
          <button onClick={reenviarCodigo} className="text-white font-medium hover:underline">
            Reenviar código
          </button>
        </p>

      </div>
    </main>
  )
}

export default function VerificarScreen() {
  return (
    <Suspense>
      <FormularioVerificar />
    </Suspense>
  )
}
