// Atendente da Pesquisa: procura fundos por nome, gestora ou CNPJ.
// Exemplo: /api/pesquisa?q=btg selic   ou   /api/pesquisa?q=00.017.024/0001-53
// Sem texto, devolve os maiores fundos (do maior patrimonio para o menor).

const GRUPOS = ["BTG", "Itau", "XP", "Bradesco"];

function semAcento(texto) {           // "Itaú Ações" -> "ITAU ACOES"
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

module.exports = async (req, res) => {
  try {
    const texto = semAcento(String(req.query.q || "")).trim();
    const grupo = String(req.query.grupo || "");

    const p = new URLSearchParams();
    p.set("select", "cnpj,grupo,nome,gestor,patrimonio,data_pl");

    const numeros = texto.replace(/\D/g, "");
    const temLetra = /[A-Z]/.test(texto);
    if (!temLetra && numeros.length >= 6) {
      p.append("cnpj", `like.*${numeros}*`);            // procurando por CNPJ
    } else {
      const palavras = texto.replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean).slice(0, 5);
      // todas as palavras precisam aparecer: and=(busca tem A, busca tem B)
      if (palavras.length) p.append("and", `(${palavras.map((w) => `busca.ilike.*${w}*`).join(",")})`);
    }
    if (GRUPOS.includes(grupo)) p.append("grupo", `eq.${grupo}`);
    p.set("order", "patrimonio.desc.nullslast");
    p.set("limit", "30");

    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/fundos?${p}`, {
      headers: { apikey: process.env.SUPABASE_SECRET_KEY },
    });
    if (!r.ok) throw new Error(`Supabase respondeu ${r.status}: ${await r.text()}`);

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
    res.status(200).json(await r.json());
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
};
