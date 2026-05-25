import { createClient } from './client'

type Rpc = { ok: boolean; erro?: string }

async function call(fn: string, args: Record<string, unknown>): Promise<Rpc> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc(fn, args)
  if (error) return { ok: false, erro: error.message }
  return (data as Rpc) ?? { ok: false, erro: 'sem_resposta' }
}

export type UsuarioAdmin = {
  id: string
  nome: string
  email: string | null
  tipo: 'cliente' | 'profissional' | 'administrador'
  cidade: string | null
  estado: string | null
  plano: string | null
  suspenso: boolean
  motivo_suspensao: string | null
  validado: boolean
  created_at: string
}

export const adminActions = {
  async listarUsuarios(): Promise<{ ok: boolean; usuarios?: UsuarioAdmin[]; erro?: string }> {
    const supabase = createClient()
    const { data, error } = await supabase.rpc('fn_admin_listar_usuarios')
    if (error) return { ok: false, erro: error.message }
    return { ok: true, usuarios: (data as UsuarioAdmin[]) || [] }
  },
  notificarUsuario(userId: string, titulo: string, corpo: string) {
    return call('fn_admin_notificar_usuario', { p_user_id: userId, p_titulo: titulo, p_corpo: corpo })
  },
  aprovarDocumento(docId: string) {
    return call('fn_admin_aprovar_documento', { p_doc_id: docId })
  },
  rejeitarDocumento(docId: string, motivo: string) {
    return call('fn_admin_rejeitar_documento', { p_doc_id: docId, p_motivo: motivo })
  },
  suspenderUsuario(userId: string, motivo: string) {
    return call('fn_admin_suspender_usuario', { p_user_id: userId, p_motivo: motivo })
  },
  reativarUsuario(userId: string) {
    return call('fn_admin_reativar_usuario', { p_user_id: userId })
  },
  promoverAdministrador(userId: string) {
    return call('fn_admin_promover_administrador', { p_user_id: userId })
  },
  marcarValidado(userId: string, validado: boolean) {
    return call('fn_admin_marcar_validado', { p_user_id: userId, p_validado: validado })
  },
}
