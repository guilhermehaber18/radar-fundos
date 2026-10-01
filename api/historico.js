// Atendente do Historico: a "jornada" de um fundo, dia a dia.
// Exemplo: /api/historico?cnpj=00017024000153
// Devolve: os dados do fundo, um registro por dia e os alertas dele.

const base = () => process.env.SUPABASE_URL + "/rest/v1";
const chave = () => ({ apikey: process.env.SUPABASE_SECRET_KEY });

// O Supabase entrega no maximo 1.000 linhas por vez: busca em "paginas" ate acabar
async function buscarTudo(caminho) {
  const linhas = [];
  for (let inicio = 0; inicio < 20000; inicio += 1000) {
    const r = await fetch(`${base()}/${caminho}&limit=1000&offset=${inicio}`, { headers: chave() });
    if (!r.ok) throw new Error(`Supabase respondeu ${r.status}: ${await r.text()}`);
    const pagina = await r.json();
    linhas.push(...pagina);
    if (pagina.length < 1000) break;
  }
  return linhas;
}

// Um registro por dia: usa a linha "geral" do fundo; se so houver subclasses, soma elas
function umPorDia(linhas) {
  const dias = new Map();
  for (const l of linhas) {
    if (!dias.has(l.data)) dias.set(l.data, []);
    dias.get(l.data).push(l);
  }
  const soma = (lista, campo) => lista.reduce((t, l) => t + (Number(l[campo]) || 0), 0);
  return [...dias.entries()].map(([data, lista]) => {
    const geral = lista.find((l) => l.subclasse === "");
    if (geral) {
      return { data, cota: geral.cota, patrimonio: geral.patrimonio, captacao: geral.captacao,
               resgate: geral.resgate, cotistas: geral.cotistas };
    }
    // sem linha geral: a cota mostrada e a da maior subclasse
    const maior = lista.reduce((a, b) => (Number(b.patrimonio) > Number(a.patrimonio) ? b : a));
    return { data, cota: maior.cota, patrimonio: soma(lista, "patrimonio"), captacao: soma(lista, "captacao"),
             resgate: soma(lista, "resgate"), cotistas: soma(lista, "cotistas") };
  });
}

module.exports = async (req, res) => {
  try {
    const cnpj = String(req.query.cnpj || "").replace(/\D/g, "");
    if (cnpj.length !== 14) {
      return res.status(400).json({ erro: "Informe o CNPJ do fundo com 14 números." });
    }

    const [fundos, linhas, alertas] = await Promise.all([
      buscarTudo(`fundos?cnpj=eq.${cnpj}&select=cnpj,grupo,gestor,nome,patrimonio,data_pl`),
      buscarTudo(`informes?cnpj=eq.${cnpj}&select=subclasse,data,cota,patrimonio,captacao,resgate,cotistas&order=data.asc`),
      buscarTudo(`alertas?cnpj=eq.${cnpj}&select=data,tipo,mensagem,valor&order=data.desc`),
    ]);

    if (!fundos.length) return res.status(404).json({ erro: "Fundo não encontrado no Radar." });

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
    res.status(200).json({ fundo: fundos[0], dias: umPorDia(linhas), alertas });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
};
