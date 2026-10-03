// =============================================================
// Vitrine do Radar de Fundos (parte 5: o mercado inteiro)
// Participacao de mercado das maiores casas, com os totais calculados pelo robo.
// =============================================================

const dadosMercado = {};             // classe -> linhas do /api/mercado (guardadas para nao buscar de novo)
let classeMercado = "Todas", periodoMercado = "1A", ordemMercado = "patrimonio";
let semDupla = true;                 // true = desconta o dinheiro que esta em cotas de outros fundos
const NOSSOS = ["BTG", "Itau", "XP", "Bradesco"];
const NOMES_CASAS = { BTG: "BTG", Itau: "Itaú", XP: "XP", Bradesco: "Bradesco", BB: "BB", CAIXA: "Caixa", OUTRAS: "Outras casas" };

function nomeCasa(c) {               // "SANTANDER" -> "Santander"
  return NOMES_CASAS[c] || c.charAt(0) + c.slice(1).toLowerCase();
}
function pontos(x) {                 // diferenca de participacao, em pontos percentuais
  if (x == null || !isFinite(x)) return "–";
  return `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} p.p.`;
}
function partic(x) {
  return x == null ? "–" : `${(x * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

async function abrirMercado() {
  const tela = document.getElementById("tela-mercado");
  if (dadosMercado[classeMercado]) { desenharMercado(); return; }
  if (!tela.innerHTML) tela.innerHTML = `<p class="info">Carregando os números do mercado…</p>`;
  try {
    const r = await fetch(`/api/mercado?classe=${encodeURIComponent(classeMercado)}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d.erro || `erro ${r.status}`);
    dadosMercado[classeMercado] = d;
    desenharMercado();
  } catch (erro) {
    tela.innerHTML = `<p class="erro">Não consegui carregar o mercado (${protegido(erro.message)}).</p>`;
  }
}

function desenharMercado() {
  const tela = document.getElementById("tela-mercado");
  const linhas = dadosMercado[classeMercado];
  if (!linhas.length) { tela.innerHTML = `<p class="vazio">Os números do mercado ainda não foram calculados.</p>`; return; }

  // dias "com buraco" (dado incompleto) nao servem para medir patrimonio, mas as entradas e saidas deles contam
  const inteiras = linhas.filter((l) => !l.buraco);
  const temSemDupla = inteiras.some((l) => l.patrimonio_sem_dupla != null);
  const pl = (l) => Number(semDupla && l.patrimonio_sem_dupla != null ? l.patrimonio_sem_dupla : l.patrimonio);
  const ultima = inteiras[inteiras.length - 1].data;
  const inicio = corte(ultima, periodoMercado);                  // funcao do comparar.js
  const comBuracos = linhas.filter((l) => l.data >= inicio && l.data <= ultima);
  const noPeriodo = comBuracos.filter((l) => !l.buraco);
  const primeira = noPeriodo[0].data;
  const nomePeriodo = PERIODOS[periodoMercado][1];

  // total do mercado em cada dia (para calcular a participacao)
  const totalDia = {};
  for (const l of noPeriodo) totalDia[l.data] = (totalDia[l.data] || 0) + pl(l);

  const casas = [...new Set(noPeriodo.map((l) => l.casa))].map((casa) => {
    const dias = noPeriodo.filter((l) => l.casa === casa);
    const ini = dias.find((d) => d.data === primeira), fim = dias.find((d) => d.data === ultima);
    const pIni = ini ? pl(ini) / totalDia[primeira] : null;
    const pFim = fim ? pl(fim) / totalDia[ultima] : null;
    return {
      casa, patrimonio: fim ? pl(fim) : 0, bruto: fim ? Number(fim.patrimonio) : 0, participacao: pFim,
      mudanca: pIni != null && pFim != null ? pFim - pIni : null,
      liquido: comBuracos.filter((d) => d.casa === casa && d.data > primeira).reduce((t, d) => t + Number(d.captacao) - Number(d.resgate), 0),
      serie: dias.map((d) => ({ data: d.data, t: tempo(d.data), v: (100 * pl(d)) / totalDia[d.data] })),
    };
  });

  const ranking = casas.filter((c) => c.casa !== "OUTRAS");
  const posicao = (campo, casa) => ranking.slice().sort((a, b) => b[campo] - a[campo]).findIndex((c) => c.casa === casa) + 1;
  const btg = casas.find((c) => c.casa === "BTG");
  const frase = btg ? `Entre as ${ranking.length} maiores casas, o BTG é a <b>${posicao("patrimonio", "BTG")}ª em patrimônio</b>,
    com ${partic(btg.participacao)} do mercado (${pontos(btg.mudanca)} em ${nomePeriodo}), e foi a
    <b>${posicao("liquido", "BTG")}ª que mais captou</b> no período (${reais(btg.liquido)}).` : "";

  const ordenadas = casas.slice().sort((a, b) =>
    (a.casa === "OUTRAS") - (b.casa === "OUTRAS") || (b[ordemMercado] ?? -Infinity) - (a[ordemMercado] ?? -Infinity));
  const colunas = [["patrimonio", "Patrimônio"], ["participacao", "Participação"], ["mudanca", `Mudança em ${nomePeriodo}`], ["liquido", `Entradas menos saídas em ${nomePeriodo}`]];

  tela.innerHTML = `
    <h2 class="titulo-tela">Mercado</h2>
    <p class="subtitulo">Como o BTG e os rivais estão em relação às maiores gestoras do Brasil.</p>
    ${botoesPeriodo("periodo-mercado", periodoMercado)}
    <div class="filtros filtros-busca"><div class="grupo-botoes" id="classe-mercado">
      ${[["Todas", "Todas as categorias"], ["Renda Fixa", "Renda Fixa"], ["Multimercado", "Multimercado"], ["Ações", "Ações"]].map(([v, n]) =>
        `<button data-classe="${v}" class="${v === classeMercado ? "ativo" : ""}">${n}</button>`).join("")}
    </div></div>
    ${temSemDupla ? `<div class="filtros filtros-busca"><div class="grupo-botoes" id="dupla-mercado">
      <button data-dupla="sem" class="${semDupla ? "ativo" : ""}">Sem dupla contagem</button>
      <button data-dupla="com" class="${semDupla ? "" : "ativo"}">Patrimônio bruto</button>
    </div></div>` : ""}
    <p class="info">De ${dataBR(primeira)} a ${dataBR(ultima)}.${temSemDupla && semDupla && btg && btg.bruto ? ` Sem a dupla contagem, o BTG encolhe ${partic(1 - btg.patrimonio / btg.bruto)}.` : ""}</p>
    <p class="frase-mercado">${frase}</p>
    <div class="graficos"><figure><figcaption>Participação no patrimônio do mercado <span>em % do total</span></figcaption>
      <div id="g-mercado"></div></figure></div>
    <button id="baixar-mercado" class="baixar">Baixar esta tabela em Excel</button>
    <div class="rolagem tabela-comparar tabela-mercado"><table>
      <thead><tr><th>#</th><th>Casa</th>${colunas.map(([id, nome]) =>
        `<th><button class="ordenar ${id === ordemMercado ? "ativo" : ""}" data-ordem="${id}">${nome}${id === ordemMercado ? " ↓" : ""}</button></th>`).join("")}</tr></thead>
      <tbody>${ordenadas.map((c, i) => `<tr class="${NOSSOS.includes(c.casa) ? "nosso" : ""}">
        <td>${c.casa === "OUTRAS" ? "" : i + 1}</td>
        <td>${NOSSOS.includes(c.casa) ? selo(c.casa) : protegido(nomeCasa(c.casa))}</td>
        <td>${reais(c.patrimonio)}</td><td>${partic(c.participacao)}</td><td>${pontos(c.mudanca)}</td><td>${reais(c.liquido)}</td></tr>`).join("")}</tbody>
    </table></div>
    <p class="nota-rodape">Só entram fundos não exclusivos de Renda Fixa, Multimercado e Ações que entregam informe diário à CVM.
      As casas são agrupadas pelo nome do gestor, de forma automática: pode haver gestoras do mesmo grupo contadas separadas.
      Muitos fundos investem em outros fundos que também estão nesta soma, e o mesmo dinheiro aparece duas vezes. "Sem dupla contagem" desconta essa parte, usando a carteira mensal que os fundos entregam à CVM. É uma aproximação: a carteira sai com cerca de 4 meses de atraso e o mesmo desconto é aplicado a todos os dias.
      "p.p." são pontos percentuais: de 5,0% para 5,5% é +0,50 p.p.</p>`;

  const coresFixas = { BTG: CORES[0], Itau: CORES[1], XP: CORES[2], Bradesco: CORES[3] };
  graficoLinhas("g-mercado", NOSSOS.map((n) => casas.find((c) => c.casa === n)).filter(Boolean).map((c) =>
    ({ nome: nomeCasa(c.casa), cor: coresFixas[c.casa], pontos: c.serie })), (v) => `${numero(v, 1)}%`);

  ligarBotoes("periodo-mercado", (b) => { periodoMercado = b.dataset.periodo; desenharMercado(); });
  if (temSemDupla) ligarBotoes("dupla-mercado", (b) => { semDupla = b.dataset.dupla === "sem"; desenharMercado(); });
  ligarBotoes("classe-mercado", (b) => { classeMercado = b.dataset.classe; abrirMercado(); });
  tela.querySelectorAll(".ordenar").forEach((b) => b.addEventListener("click", () => { ordemMercado = b.dataset.ordem; desenharMercado(); }));
  document.getElementById("baixar-mercado").addEventListener("click", () =>
    baixarCSV("radar-mercado.csv", ["Casa", "Categoria", "Patrimônio (R$)", "Participação (%)", "Mudança (pontos percentuais)", "Entradas menos saídas (R$)"],
      ordenadas.map((c) => [nomeCasa(c.casa), classeMercado, c.patrimonio, porCento(c.participacao), porCento(c.mudanca), c.liquido])));
}
