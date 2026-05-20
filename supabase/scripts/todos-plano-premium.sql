-- ============================================================
-- Coloca TODOS os perfis no plano maximo (premium)
--
-- Util para demonstracao: garante que cliente e prestador
-- tenham acesso a todos os limites maximos sem precisar
-- comprar plano pelo fluxo Pix.
--
-- Plano enum disponivel: 'free' | 'basico' | 'premium'
--   - Cliente premium = Premium Plus (5 demandas, 5 servicos simultaneos)
--   - Prestador premium = Premium (categorias ilimitadas, 6 servicos simultaneos)
--
-- Como executar:
--   1) Abra o Supabase Studio -> SQL Editor
--   2) Cole este arquivo
--   3) Execute
-- ============================================================

update public.profiles
set plano = 'premium',
    plano_atualizado_em = now();

-- Conferencia: distribuicao por tipo e plano
select tipo, plano, count(*) as qtd
from public.profiles
group by tipo, plano
order by tipo, plano;
