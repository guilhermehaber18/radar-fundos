// Atendente das Categorias.
// /api/categorias                       -> lista das categorias e subcategorias, com quantos fundos tem
// /api/categorias?classe=Renda Fixa     -> fundos da categoria (da para filtrar por sub, grupo e ordenar)

const CLASSES = ["Renda Fixa", "Multimercado", "Ações"];
const GRUPOS = ["BTG", "Itau", "XP", "Bradesco"];
const ORDENS = ["patrimonio", "rend_1m", "rend_3m", "rend_12m", "liq_3m"];
const PL_MINIMO = 50000000;          // so fundos com pelo menos R$ 50 milhoes (evita distorcoes de fundos minusculos)

async function buscarTudo(caminho) {
  const linhas = [];
  for (let inicio = 0; inicio < 20000; inicio += 1000) {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${caminho}&limit=1000&offset=${inicio}`, {
      headers: { apikey: process.env.SUPABASE_SECRET_KEY },
    });
    if (!r.ok) throw new Error(`Supabase respondeu ${r.status}: ${await r.text()}`);
    const pagina = await r.json();
    linhas.push(...pagina);
    if (pagina.length < 1000) break;
  }
  return linhas;
}

module.exports = async (req, res) => {
  try {
    const classe = String(req.query.classe || "");
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");

    // 1) Sem classe: devolve a lista de categorias (conta os fundos de cada uma)
    if (!classe) {
      const fundos = await buscarTudo(`fundos?select=classificacao,classificacao_anbima&classificacao=not.is.null&patrimonio=gte.${PL_MINIMO}&order=cnpj.asc`);
      const lista = CLASSES.map((c) => {
        const daClasse = fundos.filter((f) => f.classificacao === c);
        const subs = {};
        for (const f of daClasse) if (f.classificacao_anbima) subs[f.classificacao_anbima] = (subs[f.classificacao_anbima] || 0) + 1;
        return { classe: c, fundos: daClasse.length,
                 subcategorias: Object.entries(subs).map(([nome, n]) => ({ nome, fundos: n })).sort((a, b) => b.fundos - a.fundos) };
      });
      return res.status(200).json(lista);
    }

    // 2) Com classe: devolve os fundos
    if (!CLASSES.includes(classe)) return res.status(400).json({ erro: "Categoria desconhecida." });
    const ordem = ORDENS.includes(req.query.ordem) ? req.query.ordem : "patrimonio";
    const limite = Math.min(Number(req.query.limite) || 100, 100);

    const p = new URLSearchParams();
    p.set("select", "cnpj,grupo,nome,classificacao,classificacao_anbima,patrimonio,rend_1m,rend_3m,rend_12m,liq_3m");
    p.append("classificacao", `eq.${classe}`);
    p.append("patrimonio", `gte.${PL_MINIMO}`);
    if (req.query.sub) p.append("classificacao_anbima", `eq.${String(req.query.sub)}`);
    if (GRUPOS.includes(req.query.grupo)) p.append("grupo", `eq.${req.query.grupo}`);
    p.set("order", `${ordem}.desc.nullslast`);
    p.set("limit", String(limite));

    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/fundos?${p}`, { headers: { apikey: process.env.SUPABASE_SECRET_KEY } });
    if (!r.ok) throw new Error(`Supabase respondeu ${r.status}: ${await r.text()}`);
    res.status(200).json(await r.json());
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
};
