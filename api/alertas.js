// Atendente: busca os alertas e o total de fundos no Supabase.
// As chaves ficam no cofre da Vercel (SUPABASE_URL e SUPABASE_SECRET_KEY).

module.exports = async (req, res) => {
  try {
    const base = process.env.SUPABASE_URL + "/rest/v1";
    const chave = { apikey: process.env.SUPABASE_SECRET_KEY };

    // 1) Os alertas, do mais recente pro mais antigo, e do maior pro menor
    const campos = "cnpj,data,tipo,grupo,nome,mensagem,valor";
    const r1 = await fetch(`${base}/alertas?select=${campos}&order=data.desc,valor.desc&limit=1000`, { headers: chave });
    if (!r1.ok) throw new Error(`Supabase (alertas) respondeu ${r1.status}: ${await r1.text()}`);
    const alertas = await r1.json();

    // 2) Quantos fundos estamos acompanhando (pede so a contagem, nao a lista)
    const r2 = await fetch(`${base}/fundos?select=cnpj`, {
      headers: { ...chave, Prefer: "count=exact", Range: "0-0" },
    });
    const faixa = r2.headers.get("content-range") || "";   // ex.: "0-0/4463"
    const totalFundos = Number(faixa.split("/")[1]) || null;

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({ alertas, totalFundos });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
};
