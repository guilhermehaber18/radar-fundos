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

// mediana = o valor "do meio" de uma lista (nao se deixa enganar por um dia maluco)
function mediana(lista) {
  const o = [...lista].sort((a, b) => a - b);
  return o[Math.floor(o.length / 2)] || 0;
}

// Tira os dias com "buraco": dias em que alguma casa aparece com bem menos patrimonio
// do que nos dias vizinhos (sinal de que parte dos fundos dela nao entrou na conta).
// Nesses dias o total do mercado encolhe e a fatia de todo mundo parece maior do que e.
const VIZINHOS = 5;   // olha 5 dias para tras e 5 para a frente
const QUEDA = 0.88;   // buraco = menos de 88% do normal da casa
function tirarDiasComBuraco(linhas) {
  const datas = [...new Set(linhas.map((l) => l.data))].sort();
  const pos = {};
  datas.forEach((d, i) => (pos[d] = i));
  const porCasa = {};
  const total = datas.map(() => 0);
  for (const l of linhas) {
    if (!porCasa[l.casa]) porCasa[l.casa] = datas.map(() => 0);
    porCasa[l.casa][pos[l.data]] = l.patrimonio || 0;
    total[pos[l.data]] += l.patrimonio || 0;
  }
  const series = [total, ...Object.values(porCasa)];
  const ruins = new Set();
  for (const serie of series) {
    for (let i = 0; i < datas.length; i++) {
      const normal = mediana(serie.slice(Math.max(0, i - VIZINHOS), i + VIZINHOS + 1));
      if (normal > 0 && serie[i] < QUEDA * normal) ruins.add(datas[i]);
    }
  }
  return linhas.filter((l) => !ruins.has(l.data));
}

module.exports = async (req, res) => {
  try {
    const classe = CLASSES.includes(req.query.classe) ? req.query.classe : "Todas";
    const p = new URLSearchParams({ select: "casa,data,patrimonio,captacao,resgate,fundos", order: "data.asc,casa.asc" });
    p.append("classe", `eq.${classe}`);
    const linhas = await buscarTudo(`resumo_mercado?${p}`);
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
    res.status(200).json(tirarDiasComBuraco(linhas));
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
};
