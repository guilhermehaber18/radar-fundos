// =============================================================
// Vitrine do Radar de Fundos (parte 3: comparacoes)
// - Comparar fundos: ate 4 fundos, todos comecando em 100
// - BTG x rivais: entradas e saidas de cada grupo
// =============================================================

// cores fixas por ordem (validadas para daltonismo); a cor segue o fundo/grupo, nunca a posicao no ranking
const CORES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];
const COR_GRUPO = { BTG: CORES[0], Itau: CORES[1], XP: CORES[2], Bradesco: CORES[3] };
const ORDEM_GRUPOS = ["BTG", "Itau", "XP", "Bradesco"];

let comparados = [];                 // lista de CNPJs na comparacao
const albuns = new Map();            // CNPJ -> resposta do /api/historico (guardada para nao buscar de novo)
let periodoComparar = "1A";
let resumoGrupos = null;
let periodoRivais = "1A";
let esperaComparar = null;

function corte(ultimaData, chavePeriodo) {           // data inicial de um periodo
  const fim = new Date(ultimaData + "T12:00:00");
  return new Date(fim - PERIODOS[chavePeriodo][0] * 864e5).toISOString().slice(0, 10);
}
const tempo = (data) => new Date(data + "T12:00:00").getTime();

function botoesPeriodo(id, atual) {
  return `<div class="filtros"><div class="grupo-botoes" id="${id}">
    ${Object.entries(PERIODOS).map(([k, [, nome]]) =>
      `<button data-periodo="${k}" class="${k === atual ? "ativo" : ""}">${nome}</button>`).join("")}
  </div></div>`;
}

// ---------- GRAFICO DE LINHAS COM VARIAS SERIES (um eixo so) ----------
function graficoLinhas(idCaixa, series, fmt, { referencia = null } = {}) {
  const caixa = document.getElementById(idCaixa);
  const largura = caixa.clientWidth || 600, altura = 240;
  const mE = 68, mD = 12, mT = 10, mB = 26;

  const todos = series.flatMap((s) => s.pontos);
  if (todos.length < 2) { caixa.innerHTML = `<p class="vazio">Sem dados suficientes neste período.</p>`; return; }
  const tMin = Math.min(...todos.map((p) => p.t)), tMax = Math.max(...todos.map((p) => p.t));
  let vMin = Math.min(...todos.map((p) => p.v)), vMax = Math.max(...todos.map((p) => p.v));
  if (referencia != null) { vMin = Math.min(vMin, referencia); vMax = Math.max(vMax, referencia); }
  const folga = (vMax - vMin) * 0.08 || 1;
  vMin -= folga; vMax += folga;

  const x = (t) => mE + ((t - tMin) / (tMax - tMin || 1)) * (largura - mE - mD);
  const y = escala(vMin, vMax, altura - mB, mT);

  const grades = [vMin + folga, (vMin + vMax) / 2, vMax - folga].map((v) => `
    <line x1="${mE}" x2="${largura - mD}" y1="${y(v)}" y2="${y(v)}" stroke="${COR.grade}"/>
    <text x="${mE - 8}" y="${y(v) + 4}" text-anchor="end" class="eixo">${fmt(v)}</text>`).join("");
  const linhaRef = referencia != null
    ? `<line x1="${mE}" x2="${largura - mD}" y1="${y(referencia)}" y2="${y(referencia)}" stroke="${COR.texto}"/>` : "";

  // marcas de mes no eixo de baixo
  const datas = [...new Set(todos.map((p) => p.data))].sort();
  const pulo = Math.max(1, Math.round(datas.length / 5));
  const rotulos = datas.filter((_, i) => i % pulo === 0).map((d) =>
    `<text x="${x(tempo(d))}" y="${altura - 6}" text-anchor="middle" class="eixo">${mesCurto(d)}</text>`).join("");

  const linhas = series.map((s) => {
    const caminho = s.pontos.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
    return `<path d="${caminho}" fill="none" stroke="${s.cor}" stroke-width="2" stroke-linejoin="round"/>`;
  }).join("");

  caixa.innerHTML = `
    <ul class="legenda-series">${series.map((s) =>
      `<li><i class="chave-linha" style="background:${s.cor}"></i>${protegido(s.nome)}</li>`).join("")}</ul>
    <svg viewBox="0 0 ${largura} ${altura}" width="${largura}" height="${altura}" role="img"
         aria-label="Gráfico de linhas. Os números estão na tabela abaixo.">
      ${grades}${linhaRef}${linhas}${rotulos}
      <line class="mira" y1="${mT}" y2="${altura - mB}" stroke="${COR.texto}" visibility="hidden"/>
      <rect class="alvo" x="${mE}" y="0" width="${largura - mE - mD}" height="${altura}" fill="transparent"/>
    </svg>`;

  // mira: acha a data mais proxima e mostra o valor de cada serie nesse dia
  const svg = caixa.querySelector("svg"), mira = svg.querySelector(".mira");
  const alvo = svg.querySelector(".alvo"), dica = document.getElementById("dica");
  alvo.addEventListener("pointermove", (e) => {
    const r = svg.getBoundingClientRect();
    const px = (e.clientX - r.left) * (largura / r.width);
    const tAlvo = tMin + ((px - mE) / (largura - mE - mD)) * (tMax - tMin);
    const data = datas.reduce((a, b) => (Math.abs(tempo(b) - tAlvo) < Math.abs(tempo(a) - tAlvo) ? b : a));
    mira.setAttribute("x1", x(tempo(data))); mira.setAttribute("x2", x(tempo(data)));
    mira.setAttribute("visibility", "visible");

    const valores = series.map((s) => {
      const p = s.pontos.filter((q) => q.data <= data).pop();
      return { s, v: p ? p.v : null };
    }).sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity));
    dica.innerHTML = `<p class="dica-dia">${dataBR(data)}</p>` + valores.map(({ s, v }) =>
      `<p><i class="chave-linha" style="background:${s.cor}"></i><b>${v == null ? "–" : fmt(v)}</b> ${protegido(s.curto || s.nome)}</p>`).join("");
    dica.hidden = false;
    const caixaDica = dica.getBoundingClientRect();
    let esquerda = e.clientX + 16;
    if (esquerda + caixaDica.width > window.innerWidth - 8) esquerda = e.clientX - caixaDica.width - 16;
    dica.style.left = `${Math.max(8, esquerda)}px`;
    dica.style.top = `${Math.min(e.clientY + 16, window.innerHeight - caixaDica.height - 8)}px`;
  });
  alvo.addEventListener("pointerleave", () => { mira.setAttribute("visibility", "hidden"); dica.hidden = true; });
}

// numeros de um fundo dentro de um periodo
function resumoDoPeriodo(dias) {
  const ini = dias[0], fim = dias[dias.length - 1];
  return {
    fim,
    rend: ini.cota && fim.cota ? fim.cota / ini.cota - 1 : null,
    varPL: ini.patrimonio ? fim.patrimonio / ini.patrimonio - 1 : null,
    liquido: dias.reduce((t, d) => t + (Number(d.captacao) || 0) - (Number(d.resgate) || 0), 0),
    varCot: ini.cotistas ? fim.cotistas / ini.cotistas - 1 : null,
  };
}

// ---------- COMPARAR FUNDOS ----------
async function abrirComparar(listaCnpj) {
  comparados = listaCnpj.filter((c) => /^\d{14}$/.test(c)).slice(0, 4);
  const tela = document.getElementById("tela-comparar");
  tela.innerHTML = `<p class="info">Carregando os fundos…</p>`;
  try {
    await Promise.all(comparados.filter((c) => !albuns.has(c)).map(async (c) => {
      const r = await fetch(`/api/historico?cnpj=${c}`);
      const dados = await r.json();
      if (!r.ok) throw new Error(dados.erro || `erro ${r.status}`);
      albuns.set(c, dados);
    }));
    desenharComparar();
  } catch (erro) {
    tela.innerHTML = `<p class="erro">Não consegui carregar a comparação (${protegido(erro.message)}).</p>`;
  }
}

function mudarComparacao(nova) {      // o endereco guarda a lista: da para mandar o link para alguem
  location.hash = `comparar/${nova.join(",")}`;
}

function desenharComparar() {
  const tela = document.getElementById("tela-comparar");
  const fundos = comparados.map((c, i) => ({ ...albuns.get(c), cor: CORES[i] }));

  const escolhidos = fundos.map((f) => `
    <li><i class="chave-linha" style="background:${f.cor}"></i>${selo(f.fundo.grupo)}
      <a href="#fundo/${f.fundo.cnpj}">${protegido(f.fundo.nome)}</a>
      <button class="tirar" data-cnpj="${f.fundo.cnpj}" aria-label="Tirar ${protegido(f.fundo.nome)} da comparação">Tirar</button></li>`).join("");

  const adicionar = comparados.length < 4 ? `
    <label class="rotulo-busca" for="busca-comparar">Adicionar fundo (até 4)</label>
    <input id="busca-comparar" type="search" autocomplete="off" placeholder="Ex.: itau soberano, xp cash">
    <ol id="sugestoes" class="resultados sugestoes"></ol>` : `<p class="info">Limite de 4 fundos. Tire um para adicionar outro.</p>`;

  if (!fundos.length) {
    tela.innerHTML = `<h2 class="titulo-tela">Comparar fundos</h2>
      <p class="subtitulo">Escolha fundos para ver qual rendeu mais e qual cresceu mais, todos partindo do mesmo ponto.</p>${adicionar}`;
    ligarBuscaComparar();
    return;
  }

  // periodo comum: termina na data mais recente que todos tem
  const fimComum = fundos.map((f) => f.dias[f.dias.length - 1].data).sort()[0];
  const inicio = corte(fimComum, periodoComparar);
  const cortados = fundos.map((f) => ({ ...f, diasP: f.dias.filter((d) => d.data >= inicio && d.data <= fimComum) }));
  const inicioReal = cortados.map((f) => f.diasP[0]?.data).filter(Boolean).sort()[0] || inicio;   // primeiro dia que existe de verdade

  const base100 = (f, campo) => {
    const validos = f.diasP.filter((d) => d[campo] != null && d[campo] > 0);
    if (!validos.length) return [];
    const primeiro = validos[0][campo];
    return validos.map((d) => ({ data: d.data, t: tempo(d.data), v: (100 * d[campo]) / primeiro }));
  };
  const curto = (nome) => nome.length > 38 ? nome.slice(0, 36) + "…" : nome;

  const linhasTabela = cortados.filter((f) => f.diasP.length >= 2).map((f) => {
    const r = resumoDoPeriodo(f.diasP);
    return `<tr><td><i class="chave-linha" style="background:${f.cor}"></i>${protegido(curto(f.fundo.nome))}</td>
      <td>${reais(r.fim.patrimonio)}</td><td>${pct(r.rend)}</td><td>${pct(r.varPL)}</td>
      <td>${reais(r.liquido)}</td><td>${pct(r.varCot)}</td></tr>`;
  }).join("");

  tela.innerHTML = `
    <h2 class="titulo-tela">Comparar fundos</h2>
    <ul class="escolhidos">${escolhidos}</ul>
    ${adicionar}
    ${new Set(fundos.map((f) => f.fundo.classificacao).filter(Boolean)).size > 1
      ? `<p class="aviso-categoria">Atenção: estes fundos são de categorias diferentes (${[...new Set(fundos.map((f) => f.fundo.classificacao).filter(Boolean))].map(protegido).join(", ")}). Comparar o rendimento entre eles tem esse limite.</p>` : ""}
    ${botoesPeriodo("periodo-comparar", periodoComparar)}
    <p class="info">De ${dataBR(inicioReal)} a ${dataBR(fimComum)}. Todos começam em 100: uma linha em 110 subiu 10% no período.</p>
    <div class="graficos">
      <figure><figcaption>Rendimento da cota</figcaption><div id="g-comp-cota"></div></figure>
      <figure><figcaption>Crescimento do patrimônio <span>inclui o dinheiro que entrou e saiu</span></figcaption><div id="g-comp-pl"></div></figure>
    </div>
    <div class="rolagem tabela-comparar"><table>
      <thead><tr><th>Fundo</th><th>Patrimônio</th><th>Rendimento</th><th>Patrimônio no período</th><th>Entradas menos saídas</th><th>Cotistas</th></tr></thead>
      <tbody>${linhasTabela}</tbody>
    </table></div>
    ${fundos.length >= 2 ? `<section class="explicacao" id="explicacao-comparar">
      <h3>O que a comparação mostra</h3>
      <button id="botao-explicar-comparar" class="botao-explicar">Comparar com IA</button>
    </section>` : ""}`;

  const fmt100 = (v) => numero(v, 1);
  graficoLinhas("g-comp-cota", cortados.map((f) => ({ nome: f.fundo.nome, curto: curto(f.fundo.nome), cor: f.cor, pontos: base100(f, "cota") })), fmt100, { referencia: 100 });
  graficoLinhas("g-comp-pl", cortados.map((f) => ({ nome: f.fundo.nome, curto: curto(f.fundo.nome), cor: f.cor, pontos: base100(f, "patrimonio") })), fmt100, { referencia: 100 });

  ligarBotoes("periodo-comparar", (b) => { periodoComparar = b.dataset.periodo; desenharComparar(); });
  document.getElementById("botao-explicar-comparar")?.addEventListener("click", explicarComparacao);
  tela.querySelectorAll(".tirar").forEach((b) =>
    b.addEventListener("click", () => mudarComparacao(comparados.filter((c) => c !== b.dataset.cnpj))));
  ligarBuscaComparar();
}

function ligarBuscaComparar() {
  const campo = document.getElementById("busca-comparar");
  if (!campo) return;
  campo.addEventListener("input", () => {
    clearTimeout(esperaComparar);
    esperaComparar = setTimeout(async () => {
      const lista = document.getElementById("sugestoes");
      const texto = campo.value.trim();
      if (!texto) { lista.innerHTML = ""; return; }
      const r = await fetch(`/api/pesquisa?q=${encodeURIComponent(texto)}`);
      const fundos = (await r.json()).filter((f) => !comparados.includes(f.cnpj)).slice(0, 6);
      lista.innerHTML = fundos.length ? fundos.map((f) => `
        <li><button class="sugestao" data-cnpj="${f.cnpj}">
          <span class="res-nome">${selo(f.grupo)}${protegido(f.nome)}</span>
          <span class="res-pl">${reais(f.patrimonio)}</span></button></li>`).join("")
        : `<li class="vazio">Nenhum fundo encontrado.</li>`;
      lista.querySelectorAll(".sugestao").forEach((b) =>
        b.addEventListener("click", () => mudarComparacao([...comparados, b.dataset.cnpj])));
    }, 300);
  });
}

// ---------- BTG x RIVAIS ----------
async function abrirRivais() {
  const tela = document.getElementById("tela-rivais");
  if (resumoGrupos) { desenharRivais(); return; }
  tela.innerHTML = `<p class="info">Carregando o resumo dos grupos…</p>`;
  try {
    const r = await fetch("/api/resumo");
    const dados = await r.json();
    if (!r.ok) throw new Error(dados.erro || `erro ${r.status}`);
    resumoGrupos = dados;
    desenharRivais();
  } catch (erro) {
    tela.innerHTML = `<p class="erro">Não consegui carregar o resumo (${protegido(erro.message)}).</p>`;
  }
}

function desenharRivais() {
  const tela = document.getElementById("tela-rivais");
  if (!resumoGrupos.length) { tela.innerHTML = `<p class="vazio">O resumo ainda não foi calculado.</p>`; return; }
  const ultima = resumoGrupos[resumoGrupos.length - 1].data;
  const inicio = corte(ultima, periodoRivais);
  const nomePeriodo = PERIODOS[periodoRivais][1];

  const grupos = ORDEM_GRUPOS.map((g) => {
    const dias = resumoGrupos.filter((l) => l.grupo === g && l.data >= inicio);
    if (!dias.length) return null;
    let acumulado = 0;
    const pontos = dias.map((d) => {
      acumulado += (Number(d.captacao) || 0) - (Number(d.resgate) || 0);
      return { data: d.data, t: tempo(d.data), v: acumulado };
    });
    const ini = dias[0], fim = dias[dias.length - 1];
    return { g, pontos, liquido: acumulado, fim, varPL: ini.patrimonio ? fim.patrimonio / ini.patrimonio - 1 : null };
  }).filter(Boolean);

  const inicioReal = grupos.map((x) => x.pontos[0].data).sort()[0] || inicio;   // primeiro dia que existe de verdade

  // barras horizontais: entradas menos saidas no periodo (verde = entrou mais, vermelho = saiu mais)
  const maior = Math.max(1, ...grupos.map((x) => Math.abs(x.liquido)));
  const barras = grupos.map((x) => {
    const largura = Math.max(1, (Math.abs(x.liquido) / maior) * 50);
    const positivo = x.liquido >= 0;
    return `<li><span class="barra-nome">${selo(x.g)}</span>
      <span class="barra-trilho"><i class="${positivo ? "entrada" : "saida"}"
        style="${positivo ? "left:50%" : `right:50%`};width:${largura}%"></i></span>
      <span class="barra-valor">${positivo ? "↑" : "↓"} ${reais(x.liquido)}</span></li>`;
  }).join("");

  tela.innerHTML = `
    <h2 class="titulo-tela">BTG x rivais</h2>
    <p class="subtitulo">Quanto dinheiro entrou ou saiu dos fundos de cada grupo, somando todos os fundos dele.</p>
    ${botoesPeriodo("periodo-rivais", periodoRivais)}
    <p class="info">De ${dataBR(inicioReal)} a ${dataBR(ultima)}.</p>
    <figure class="figura-barras"><figcaption>Entradas menos saídas em ${nomePeriodo}</figcaption>
      <ul class="barras-h">${barras}</ul></figure>
    <div class="graficos"><figure><figcaption>Entradas menos saídas, acumulado no período</figcaption>
      <div id="g-rivais"></div></figure></div>
    <div class="rolagem tabela-comparar"><table>
      <thead><tr><th>Grupo</th><th>Fundos</th><th>Patrimônio em ${dataBR(ultima)}</th><th>Patrimônio no período</th><th>Entradas menos saídas</th></tr></thead>
      <tbody>${grupos.map((x) => `<tr><td>${selo(x.g)}</td><td>${numero(x.fim.fundos)}</td>
        <td>${reais(x.fim.patrimonio)}</td><td>${pct(x.varPL)}</td><td>${reais(x.liquido)}</td></tr>`).join("")}</tbody>
    </table></div>
    <p class="nota-rodape">Atenção: muitos fundos investem em outros fundos do mesmo grupo, então a soma pode contar o mesmo dinheiro duas vezes.
      Os números servem para comparar tendências entre os grupos, não como o tamanho exato de cada gestora.
      Os últimos dias só entram quando quase todos os fundos já entregaram o informe à CVM.</p>`;

  graficoLinhas("g-rivais", grupos.map((x) => ({ nome: NOME_GRUPO[x.g], cor: COR_GRUPO[x.g], pontos: x.pontos })), reais, { referencia: 0 });
  ligarBotoes("periodo-rivais", (b) => { periodoRivais = b.dataset.periodo; desenharRivais(); });
}

// ---------- A IA COMENTANDO A COMPARACAO ----------
async function explicarComparacao() {
  const caixa = document.getElementById("explicacao-comparar");
  const titulo = caixa.querySelector("h3").outerHTML;
  const lista = comparados.join(","), periodoPedido = periodoComparar;
  caixa.innerHTML = titulo + `<p class="info">Calculando os números e escrevendo o relatório…</p>`;
  try {
    const r = await fetch(`/api/explicar?cnpjs=${lista}&periodo=${periodoPedido}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d.erro || `erro ${r.status}`);
    if (comparados.join(",") !== lista || periodoComparar !== periodoPedido) return;     // a pessoa ja mudou a comparacao
    const paragrafos = d.texto.split(/\n\s*\n/).map((p) => `<p class="texto-ia">${protegido(p.trim())}</p>`).join("");
    const extra = Array.isArray(d.fatos) ? `
      <div class="rolagem tabela-comparar"><table>
        <thead><tr><th>Fundo</th><th>Oscilação típica por dia</th><th>Dias com cota em queda</th><th>Melhor mês</th><th>Pior mês</th><th>Alertas</th></tr></thead>
        <tbody>${d.fatos.map((f) => `<tr><td>${protegido(f.fundo.length > 38 ? f.fundo.slice(0, 36) + "…" : f.fundo)}</td>
          <td>${f.oscilacao_diaria_tipica_pct != null ? numero(f.oscilacao_diaria_tipica_pct * 100, 2) + "%" : "–"}</td>
          <td>${numero(f.dias_com_cota_em_queda)}</td>
          <td>${f.melhor_mes_da_cota ? pct(f.melhor_mes_da_cota.rendimento_pct) + ` <span class="data-pequena">${mesCurto(f.melhor_mes_da_cota.mes + "-01")}</span>` : "–"}</td>
          <td>${f.pior_mes_da_cota ? pct(f.pior_mes_da_cota.rendimento_pct) + ` <span class="data-pequena">${mesCurto(f.pior_mes_da_cota.mes + "-01")}</span>` : "–"}</td>
          <td>${numero(f.alertas_no_periodo)}</td></tr>`).join("")}</tbody>
      </table></div>
      ${d.fatos[0].cdi_pct != null ? `<p class="info">CDI no mesmo período: ${pct(d.fatos[0].cdi_pct)}.</p>` : ""}` : "";
    const origem = d.comIA
      ? "Texto escrito por IA (Gemini) só com os números das tabelas. Pode conter erros: confira nas tabelas. Não é recomendação de investimento."
      : "Resumo automático com os números das tabelas (a IA não respondeu agora).";
    caixa.innerHTML = titulo + paragrafos + extra + `<p class="origem-ia">${origem}</p>`;
    if (d.aviso) console.log("IA indisponível:", d.aviso);
  } catch (erro) {
    caixa.innerHTML = titulo + `<p class="erro">Não consegui gerar o relatório (${protegido(erro.message)}).</p>
      <button id="botao-explicar-comparar" class="botao-explicar">Tentar de novo</button>`;
    document.getElementById("botao-explicar-comparar").addEventListener("click", explicarComparacao);
  }
}
