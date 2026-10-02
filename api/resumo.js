// Atendente do Resumo: BTG x Itau x XP x Bradesco, dia a dia.
// Devolve, para cada grupo e cada dia: patrimonio, entradas, saidas e quantos fundos informaram.

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

// Os ultimos dias costumam estar "pela metade" (nem todo fundo entregou o informe ainda).
// Cortamos do fim os dias em que algum grupo tem bem menos fundos que o normal dele.
function cortarDiasIncompletos(linhas) {
  const datas = [...new Set(linhas.map((l) => l.data))].sort();
  const porGrupo = {};
  for (const l of linhas) {
    const dias = (porGrupo[l.grupo] ||= {});
    dias[l.data] = (dias[l.data] || 0) + l.fundos;          // soma as categorias do mesmo grupo
  }

  const normal = {};                                  // mediana dos ultimos 30 dias de cada grupo
  for (const [g, dias] of Object.entries(porGrupo)) {
    const ultimos = datas.slice(-30).map((d) => dias[d] || 0).sort((a, b) => a - b);
    normal[g] = ultimos[Math.floor(ultimos.length / 2)];
  }
  let fim = datas.length;
  while (fim > 0 && Object.keys(porGrupo).some((g) => (porGrupo[g][datas[fim - 1]] || 0) < 0.95 * normal[g])) fim--;
  const ultimaBoa = datas[fim - 1];
  return linhas.filter((l) => l.data <= ultimaBoa);
}

module.exports = async (req, res) => {
  try {
    // /api/resumo            -> total de cada grupo por dia
    // /api/resumo?por=classe -> o mesmo, separado por categoria (Renda Fixa, Multimercado, Acoes)
    const linhas = req.query.por === "classe"
      ? await buscarTudo("resumo_classes?select=grupo,classe,data,patrimonio,captacao,resgate,fundos&order=data.asc,grupo.asc,classe.asc")
      : await buscarTudo("resumo_grupos?select=grupo,data,patrimonio,captacao,resgate,fundos&order=data.asc,grupo.asc");
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
    res.status(200).json(cortarDiasIncompletos(linhas));
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
};
