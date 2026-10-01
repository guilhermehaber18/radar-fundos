// =============================================================
// Vitrine do Radar de Fundos (parte 2: a pagina do fundo)
// Mostra os numeros do periodo, 3 graficos da "jornada" e os alertas.
// Os graficos sao desenhados a mao em SVG (sem bibliotecas).
// =============================================================

let fundoAtual = null;          // { fundo, dias, alertas } vindo do /api/historico
let periodo = "1A";
let indiceMira = null;          // qual dia a mira (linha vertical) esta apontando
let geometria = null;           // posicoes dos graficos, para a mira

const PERIODOS = { "1M": [31, "1 mês"], "3M": [92, "3 meses"], "6M": [183, "6 meses"], "1A": [366, "1 ano"] };
const COR = { saida: "#B3261E", entrada: "#0B7A55", linha: "#16233B", grade: "#D9DEE7", texto: "#5B6576", papel: "#F4F6F9" };

// ---------- FORMATOS ----------
function pct(x) {                    // 0.0123 -> "+1,2%"
  if (x == null || !isFinite(x)) return "–";
  const sinal = x > 0 ? "+" : x < 0 ? "−" : "";
  return `${sinal}${Math.abs(x * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
}
function numero(x, casas = 0) {
  if (x == null || isNaN(x)) return "–";
  return Number(x).toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas });
}
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function mesCurto(data) {            // "2025-10-01" -> "out/25"
  return `${MESES[Number(data.slice(5, 7)) - 1]}/${data.slice(2, 4)}`;
}

// ---------- BUSCAR O ALBUM DO FUNDO ----------
async function abrirFundo(cnpj) {
  const tela = document.getElementById("tela-fundo");
  if (fundoAtual && fundoAtual.fundo.cnpj === cnpj) { desenharFundo(); return; }
  tela.innerHTML = `<p class="info">Carregando o histórico do fundo…</p>`;
  try {
    const resposta = await fetch(`/api/historico?cnpj=${encodeURIComponent(cnpj)}`);
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || `erro ${resposta.status}`);
    fundoAtual = dados;
    periodo = "1A";
    desenharFundo();
  } catch (erro) {
    tela.innerHTML = `<a class="voltar" href="#pesquisa">Voltar para a pesquisa</a>
      <p class="erro">Não consegui abrir este fundo (${protegido(erro.message)}).</p>`;
  }
}

function diasDoPeriodo() {
  const dias = fundoAtual.dias;
  if (!dias.length) return [];
  const ultimo = new Date(dias[dias.length - 1].data + "T12:00:00");
  const corte = new Date(ultimo - PERIODOS[periodo][0] * 864e5).toISOString().slice(0, 10);
  return dias.filter((d) => d.data >= corte);
}

// ---------- A PAGINA ----------
function desenharFundo() {
  const { fundo, alertas } = fundoAtual;
  const dias = diasDoPeriodo();
  const tela = document.getElementById("tela-fundo");

  const cabecalho = `
    <a class="voltar" href="#pesquisa">Voltar para a pesquisa</a>
    <header class="fundo-topo">
      <p class="fundo-gestor">${selo(fundo.grupo)}${protegido(fundo.gestor)}</p>
      <h2>${protegido(fundo.nome)}</h2>
      <p class="info">CNPJ ${cnpjBonito(fundo.cnpj)}</p>
      <a class="botao-comparar" href="#comparar/${fundo.cnpj}">Comparar com outros fundos</a>
    </header>`;

  if (dias.length < 2) {
    tela.innerHTML = cabecalho + `<p class="vazio">Ainda não há dias suficientes de histórico para este fundo.</p>`;
    return;
  }

  const ini = dias[0], fim = dias[dias.length - 1];
  const varPL = ini.patrimonio ? fim.patrimonio / ini.patrimonio - 1 : null;
  const rend = ini.cota && fim.cota ? fim.cota / ini.cota - 1 : null;
  const liquido = dias.reduce((t, d) => t + (Number(d.captacao) || 0) - (Number(d.resgate) || 0), 0);
  const varCot = ini.cotistas ? fim.cotistas / ini.cotistas - 1 : null;
  const alertasPeriodo = alertas.filter((a) => a.data >= ini.data);
  const nomePeriodo = PERIODOS[periodo][1];

  tela.innerHTML = cabecalho + `
    <div class="filtros" aria-label="Período">
      <div class="grupo-botoes" id="periodo">
        ${Object.entries(PERIODOS).map(([k, [, nome]]) =>
          `<button data-periodo="${k}" class="${k === periodo ? "ativo" : ""}">${nome}</button>`).join("")}
      </div>
    </div>

    <dl class="numeros">
      <div><dt>Patrimônio em ${dataBR(fim.data)}</dt><dd class="num">${reais(fim.patrimonio)}</dd>
        <dd class="num nota">${pct(varPL)} em ${nomePeriodo}</dd></div>
      <div><dt>Rendimento da cota</dt><dd class="num">${pct(rend)}</dd>
        <dd class="nota">em ${nomePeriodo}</dd></div>
      <div><dt>Entradas menos saídas</dt><dd class="num">${reais(liquido)}</dd>
        <dd class="nota">em ${nomePeriodo}</dd></div>
      <div><dt>Cotistas</dt><dd class="num">${numero(fim.cotistas)}</dd>
        <dd class="num nota">${pct(varCot)} em ${nomePeriodo}</dd></div>
    </dl>

    <div class="graficos" id="graficos" tabindex="0"
         aria-label="Gráficos da jornada do fundo. Use as setas para ver dia a dia.">
      <figure><figcaption>Patrimônio <span>os pontos marcam os alertas</span></figcaption><div id="g-pl"></div></figure>
      <figure><figcaption>Valor da cota</figcaption><div id="g-cota"></div></figure>
      <figure><figcaption>Entradas e saídas do dia
        <span class="legenda"><i class="chave entrada"></i>Entradas <i class="chave saida"></i>Saídas</span></figcaption>
        <div id="g-fluxo"></div></figure>
    </div>

    ${tabelaNoTempo(fundoAtual.dias)}

    <details class="tabela">
      <summary>Ver os números em tabela</summary>
      <div class="rolagem"><table>
        <thead><tr><th>Dia</th><th>Patrimônio</th><th>Cota</th><th>Entradas</th><th>Saídas</th><th>Cotistas</th></tr></thead>
        <tbody>${dias.slice().reverse().map((d) => `<tr><td>${dataBR(d.data)}</td><td class="num">${reais(d.patrimonio)}</td>
          <td class="num">${numero(d.cota, 4)}</td><td class="num">${reais(d.captacao)}</td>
          <td class="num">${reais(d.resgate)}</td><td class="num">${numero(d.cotistas)}</td></tr>`).join("")}</tbody>
      </table></div>
    </details>

    <section class="alertas-fundo">
      <h3>Alertas deste fundo em ${nomePeriodo}</h3>
      ${alertasPeriodo.length
        ? alertasPeriodo.map((a) => linhaAlerta(a, Math.max(...alertasPeriodo.map((x) => x.valor)), false)).join("")
        : `<p class="vazio">Nenhum movimento fora do normal neste período.</p>`}
    </section>`;

  ligarBotoes("periodo", (b) => { periodo = b.dataset.periodo; desenharFundo(); });
  indiceMira = null;
  desenharGraficos(dias, alertasPeriodo);
}

// ---------- O FUNDO CONTRA ELE MESMO NO PASSADO ----------
function tabelaNoTempo(todosDias) {
  const hoje = todosDias[todosDias.length - 1];
  const momentos = [["Hoje", 0], ["1 mês atrás", 31], ["3 meses atrás", 92], ["6 meses atrás", 183], ["1 ano atrás", 366]];
  const linhas = momentos.map(([nome, dias]) => {
    const alvo = new Date(new Date(hoje.data + "T12:00:00") - dias * 864e5).toISOString().slice(0, 10);
    let d = todosDias.filter((x) => x.data <= alvo).pop();       // o dia util mais proximo antes da data
    if (!d && dias === 366) d = todosDias[0];                      // historico um pouco menor que 1 ano: usa o primeiro dia
    if (!d) return "";
    const rendAteHoje = dias && d.cota && hoje.cota ? pct(hoje.cota / d.cota - 1) : "";
    return `<tr><td>${nome}<span class="data-pequena">${dataBR(d.data)}</span></td>
      <td>${reais(d.patrimonio)}</td><td>${numero(d.cota, 4)}</td><td>${numero(d.cotistas)}</td><td>${rendAteHoje}</td></tr>`;
  }).join("");
  return `
    <section class="no-tempo">
      <h3>O fundo contra ele mesmo</h3>
      <div class="rolagem tabela-comparar"><table>
        <thead><tr><th>Quando</th><th>Patrimônio</th><th>Cota</th><th>Cotistas</th><th>Rendeu de lá até hoje</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table></div>
    </section>`;
}

// ---------- OS GRAFICOS ----------
function escala(min, max, embaixo, emcima) {  // transforma valor em altura: min fica embaixo, max em cima
  const faixa = max - min || 1;
  return (v) => embaixo - ((v - min) / faixa) * (embaixo - emcima);
}

function desenharGraficos(dias, alertasPeriodo) {
  const largura = document.getElementById("g-pl").clientWidth || 600;
  const mE = 64, mD = 10;                       // margens esquerda e direita
  const passo = (largura - mE - mD) / (dias.length - 1);
  const xDe = (i) => mE + i * passo;
  const datasAlerta = new Map();                 // dia -> lista de alertas daquele dia
  for (const a of alertasPeriodo) {
    if (!datasAlerta.has(a.data)) datasAlerta.set(a.data, []);
    datasAlerta.get(a.data).push(a);
  }

  // marcas de mes no eixo de baixo (umas 5, espalhadas)
  const marcas = [];
  const pulo = Math.max(1, Math.round(dias.length / 5));
  for (let i = 0; i < dias.length; i += pulo) marcas.push(i);

  geometria = { dias, xDe, passo, mE, largura, graficos: [] };

  // --- linhas: patrimonio e cota ---
  const linhas = [
    { id: "g-pl", campo: "patrimonio", fmt: reais, alertas: true },
    { id: "g-cota", campo: "cota", fmt: (v) => numero(v, 2) },
  ];
  for (const g of linhas) {
    const altura = 150, mT = 10, mB = 8;
    const valores = dias.map((d) => d[g.campo]).filter((v) => v != null);
    let min = Math.min(...valores), max = Math.max(...valores);
    const folga = (max - min) * 0.08 || Math.abs(max) * 0.01 || 1;
    min -= folga; max += folga;
    const y = escala(min, max, altura - mB, mT);

    let caminho = "", novo = true;
    dias.forEach((d, i) => {
      if (d[g.campo] == null) { novo = true; return; }
      caminho += `${novo ? "M" : "L"}${xDe(i).toFixed(1)},${y(d[g.campo]).toFixed(1)}`;
      novo = false;
    });

    const grades = [min + folga, (min + max) / 2, max - folga].map((v) => `
      <line x1="${mE}" x2="${largura - mD}" y1="${y(v)}" y2="${y(v)}" stroke="${COR.grade}" stroke-width="1"/>
      <text x="${mE - 8}" y="${y(v) + 4}" text-anchor="end" class="eixo">${g.fmt(v)}</text>`).join("");

    // um ponto por alerta; se o dia tem entrada E saida fora do normal, os dois aparecem empilhados
    const pontos = g.alertas ? dias.map((d, i) => {
      const lista = datasAlerta.get(d.data);
      if (!lista || d[g.campo] == null) return "";
      return lista.map((a, k) => `<circle cx="${xDe(i)}" cy="${y(d[g.campo]) - k * 12}" r="5"
        fill="${eSaida(a) ? COR.saida : COR.entrada}" stroke="${COR.papel}" stroke-width="2"/>`).join("");
    }).join("") : "";

    document.getElementById(g.id).innerHTML = `
      <svg viewBox="0 0 ${largura} ${altura}" width="${largura}" height="${altura}" role="img"
           aria-label="Gráfico de linha. Use a tabela abaixo para ver os números.">
        ${grades}
        <path d="${caminho}" fill="none" stroke="${COR.linha}" stroke-width="2" stroke-linejoin="round"/>
        ${pontos}
        <line class="mira" y1="${mT}" y2="${altura - mB}" stroke="${COR.texto}" stroke-width="1" visibility="hidden"/>
        <circle class="mira-ponto" r="4" fill="${COR.linha}" stroke="${COR.papel}" stroke-width="2" visibility="hidden"/>
        <rect class="alvo" x="${mE - passo / 2}" y="0" width="${largura - mE - mD + passo}" height="${altura}" fill="transparent"/>
      </svg>`;
    geometria.graficos.push({ id: g.id, campo: g.campo, y });
  }

  // --- barras: entradas para cima, saidas para baixo ---
  {
    const altura = 150, mT = 8, mB = 26;
    const maior = Math.max(1, ...dias.map((d) => Math.max(Number(d.captacao) || 0, Number(d.resgate) || 0)));
    const y = escala(-maior, maior, altura - mB, mT);
    const zero = y(0);
    const larguraBarra = Math.max(1, Math.min(10, passo - 2));
    const arredonda = larguraBarra >= 4 ? 2 : 0;

    const barras = dias.map((d, i) => {
      const x = xDe(i) - larguraBarra / 2;
      const ent = Number(d.captacao) || 0, sai = Number(d.resgate) || 0;
      let s = "";
      if (ent > 0) s += `<rect x="${x}" y="${y(ent)}" width="${larguraBarra}" height="${Math.max(1, zero - y(ent))}" rx="${arredonda}" fill="${COR.entrada}"/>`;
      if (sai > 0) s += `<rect x="${x}" y="${zero}" width="${larguraBarra}" height="${Math.max(1, y(-sai) - zero)}" rx="${arredonda}" fill="${COR.saida}"/>`;
      return s;
    }).join("");

    const rotulos = marcas.map((i) =>
      `<text x="${xDe(i)}" y="${altura - 6}" text-anchor="middle" class="eixo">${mesCurto(dias[i].data)}</text>`).join("");

    document.getElementById("g-fluxo").innerHTML = `
      <svg viewBox="0 0 ${largura} ${altura}" width="${largura}" height="${altura}" role="img"
           aria-label="Gráfico de barras de entradas e saídas. Use a tabela abaixo para ver os números.">
        <text x="${mE - 8}" y="${y(maior) + 4}" text-anchor="end" class="eixo">${reais(maior)}</text>
        <text x="${mE - 8}" y="${zero + 4}" text-anchor="end" class="eixo">0</text>
        <text x="${mE - 8}" y="${y(-maior) + 4}" text-anchor="end" class="eixo">${reais(-maior)}</text>
        ${barras}
        <line x1="${mE}" x2="${largura - mD}" y1="${zero}" y2="${zero}" stroke="${COR.texto}" stroke-width="1"/>
        ${rotulos}
        <line class="mira" y1="${mT}" y2="${altura - mB}" stroke="${COR.texto}" stroke-width="1" visibility="hidden"/>
        <rect class="alvo" x="${mE - passo / 2}" y="0" width="${largura - mE - mD + passo}" height="${altura}" fill="transparent"/>
      </svg>`;
    geometria.graficos.push({ id: "g-fluxo", campo: null, y });
  }

  ligarMira();
}

// ---------- A MIRA (linha vertical + caixinha com os numeros) ----------
function mostrarMira(i, ancora) {
  const { dias, xDe } = geometria;
  i = Math.max(0, Math.min(dias.length - 1, i));
  indiceMira = i;
  const d = dias[i];
  const x = xDe(i);

  for (const g of geometria.graficos) {
    const svg = document.querySelector(`#${g.id} svg`);
    const mira = svg.querySelector(".mira");
    mira.setAttribute("x1", x); mira.setAttribute("x2", x); mira.setAttribute("visibility", "visible");
    const ponto = svg.querySelector(".mira-ponto");
    if (ponto && d[g.campo] != null) {
      ponto.setAttribute("cx", x); ponto.setAttribute("cy", g.y(d[g.campo])); ponto.setAttribute("visibility", "visible");
    }
  }

  const alertasDoDia = fundoAtual.alertas.filter((a) => a.data === d.data);
  const dica = document.getElementById("dica");
  dica.innerHTML = `
    <p class="dica-dia">${dataBR(d.data)}</p>
    <p><b class="num">${reais(d.patrimonio)}</b> patrimônio</p>
    <p><b class="num">${numero(d.cota, 4)}</b> cota</p>
    <p><i class="chave entrada"></i><b class="num">${reais(d.captacao)}</b> entradas</p>
    <p><i class="chave saida"></i><b class="num">${reais(d.resgate)}</b> saídas</p>
    ${alertasDoDia.map((a) => `<p class="dica-alerta">${protegido(a.mensagem)}</p>`).join("")}`;
  dica.hidden = false;

  // posiciona a caixinha perto do ponto, sem sair da tela
  const caixa = dica.getBoundingClientRect();
  let esquerda = ancora.x + 16, topo = ancora.y + 16;
  if (esquerda + caixa.width > window.innerWidth - 8) esquerda = ancora.x - caixa.width - 16;
  if (topo + caixa.height > window.innerHeight - 8) topo = window.innerHeight - caixa.height - 8;
  dica.style.left = `${Math.max(8, esquerda)}px`;
  dica.style.top = `${Math.max(8, topo)}px`;
}

function esconderMira() {
  document.querySelectorAll("#graficos .mira, #graficos .mira-ponto").forEach((m) => m.setAttribute("visibility", "hidden"));
  document.getElementById("dica").hidden = true;
}

function ligarMira() {
  const area = document.getElementById("graficos");
  area.querySelectorAll(".alvo").forEach((alvo) => {
    alvo.addEventListener("pointermove", (e) => {
      const svg = alvo.ownerSVGElement.getBoundingClientRect();
      const xNoGrafico = (e.clientX - svg.left) * (geometria.largura / svg.width);
      mostrarMira(Math.round((xNoGrafico - geometria.mE) / geometria.passo), { x: e.clientX, y: e.clientY });
    });
    alvo.addEventListener("pointerleave", esconderMira);
  });

  // pelo teclado: setas andam dia a dia
  const ancoraTeclado = () => {
    const r = area.getBoundingClientRect();
    return { x: r.left + geometria.xDe(indiceMira) * (r.width / geometria.largura), y: r.top + 20 };
  };
  area.addEventListener("focus", () => { mostrarMira(geometria.dias.length - 1, { x: 0, y: 0 }); mostrarMira(indiceMira, ancoraTeclado()); });
  area.addEventListener("blur", esconderMira);
  area.addEventListener("keydown", (e) => {
    if (indiceMira == null) return;
    const salto = { ArrowLeft: -1, ArrowRight: 1, PageUp: -20, PageDown: 20 }[e.key];
    if (e.key === "Escape") { esconderMira(); return; }
    if (!salto) return;
    e.preventDefault();
    mostrarMira(indiceMira + salto, { x: 0, y: 0 });
    mostrarMira(indiceMira, ancoraTeclado());
  });
}

// redesenha os graficos quando a janela muda de tamanho
let esperaTamanho = null;
window.addEventListener("resize", () => {
  clearTimeout(esperaTamanho);
  esperaTamanho = setTimeout(() => {
    if (!document.getElementById("tela-fundo").hidden && fundoAtual && document.getElementById("graficos")) {
      const dias = diasDoPeriodo();
      desenharGraficos(dias, fundoAtual.alertas.filter((a) => a.data >= dias[0].data));
    }
  }, 200);
});
