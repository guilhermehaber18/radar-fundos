// Atendente do Mercado: totais por "casa" (as 20 maiores gestoras, os nossos 4 grupos e OUTRAS).
// /api/mercado                  -> todas as categorias somadas
// /api/mercado?classe=Ações     -> so uma categoria

const CLASSES = ["Todas", "Renda Fixa", "Multimercado", "Ações"];

async function pagina(caminho, inicio) {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${caminho}&limit=1000&offset=${inicio}`, {
    headers: { apikey: process.env.SUPABASE_SECRET_KEY },
  });
  if (!r.ok) throw new Error(`Supabase respondeu ${r.status}: ${await r.text()}`);
  return r.json();
}

// busca varias "paginas" de 1.000 linhas ao mesmo tempo (mais rapido que uma por vez)
async function buscarTudo(caminho) {
  const linhas = [];
  for (let bloco = 0; bloco < 6; bloco++) {
    const lote = await Promise.all([0, 1, 2, 3].map((i) => pagina(caminho, (bloco * 4 + i) * 1000)));
    for (const p of lote) linhas.push(...p);
    if (lote[3].length < 1000) break;
  }
  return linhas;
}

// corta do fim os dias em que bem menos fundos que o normal ja entregaram o informe
function cortarDiasIncompletos(linhas) {
  const porDia = {};
  for (const l of linhas) porDia[l.data] = (porDia[l.data] || 0) + l.fundos;
  const datas = Object.keys(porDia).sort();
  const ultimos = datas.slice(-30).map((d) => porDia[d]).sort((a, b) => a - b);
  const normal = ultimos[Math.floor(ultimos.length / 2)] || 0;
  let fim = datas.length;
  while (fim > 0 && porDia[datas[fim - 1]] < 0.95 * normal) fim--;
  const ultimaBoa = datas[fim - 1];
  return linhas.filter((l) => l.data <= ultimaBoa);
}

module.exports = async (req, res) => {
  try {
    const classe = CLASSES.includes(req.query.classe) ? req.query.classe : "Todas";
    const p = new URLSearchParams({ select: "casa,data,patrimonio,captacao,resgate,fundos", order: "data.asc,casa.asc" });
    p.append("classe", `eq.${classe}`);
    const linhas = await buscarTudo(`resumo_mercado?${p}`);
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
    res.status(200).json(cortarDiasIncompletos(linhas));
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
};
