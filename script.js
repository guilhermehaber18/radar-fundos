// =============================================================
// Vitrine do Radar de Fundos
// Pede os alertas ao atendente (/api/alertas) e desenha a pagina.
// Nunca guarda chave nenhuma: quem fala com o Supabase e o atendente.
// =============================================================

// ---------- MEMORIA DO SITE ----------
let todosAlertas = [];
let totalFundos = null;
let filtroGrupo = "todos";
let filtroTipo = "todos";

const NOME_GRUPO = { BTG: "BTG", Itau: "Itaú", XP: "XP", Bradesco: "Bradesco" };

// ---------- FERRAMENTAS PEQUENAS ----------
function dataBR(texto) {            // "2026-09-30" -> "30/09/2026"
  return `${texto.slice(8, 10)}/${texto.slice(5, 7)}/${texto.slice(0, 4)}`;
}

function protegido(texto) {         // evita que um nome estranho quebre o HTML
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function eSaida(alerta) {
  return alerta.tipo === "resgate_atipico";
}

// ---------- BUSCAR OS DADOS ----------
async function carregar() {
  try {
    const resposta = await fetch("/api/alertas");
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || `erro ${resposta.status}`);
    todosAlertas = dados.alertas;
    totalFundos = dados.totalFundos;
    desenharTudo();
  } catch (erro) {
    document.getElementById("info").textContent = "";
    document.getElementById("lista").innerHTML =
      `<p class="erro">Não consegui carregar os alertas (${protegido(erro.message)}). Atualize a página em alguns minutos.</p>`;
  }
}

// ---------- DESENHAR ----------
function desenharTudo() {
  desenharInfo();
  desenharDestaque();
  desenharLista();
}

function desenharInfo() {
  const ultimaData = todosAlertas.length ? dataBR(todosAlertas[0].data) : "sem dados";
  const fundos = totalFundos ? `${totalFundos.toLocaleString("pt-BR")} fundos acompanhados. ` : "";
  document.getElementById("info").textContent =
    `${fundos}Dados até ${ultimaData}. Atualiza sozinho todo dia de manhã.`;
}

function desenharDestaque() {
  const caixa = document.getElementById("destaque");
  if (!todosAlertas.length) { caixa.innerHTML = ""; return; }

  // o maior movimento do dia mais recente (a lista ja vem ordenada por data e valor)
  const maior = todosAlertas[0];
  caixa.className = "destaque " + (eSaida(maior) ? "saida" : "entrada");
  caixa.innerHTML = `
    <p class="quando">Maior movimento fora do normal em ${dataBR(maior.data)}</p>
    <h2>${protegido(maior.nome)}</h2>
    <p class="mensagem"><span class="selo ${maior.grupo}">${NOME_GRUPO[maior.grupo] || maior.grupo}</span>${protegido(maior.mensagem)}</p>
  `;
}

function desenharLista() {
  const lista = document.getElementById("lista");
  const filtrados = todosAlertas.filter((a) =>
    (filtroGrupo === "todos" || a.grupo === filtroGrupo) &&
    (filtroTipo === "todos" || a.tipo === filtroTipo)
  );

  if (!filtrados.length) {
    lista.innerHTML = `<p class="vazio">Nenhum alerta com esses filtros. Experimente outro grupo ou tipo.</p>`;
    return;
  }

  // a barra usa raiz quadrada para os gigantes nao esmagarem os outros
  const maiorValor = Math.max(...filtrados.map((a) => a.valor));
  const largura = (v) => Math.max(2, Math.round(100 * Math.sqrt(v / maiorValor)));

  // separa por dia
  const porDia = {};
  for (const a of filtrados) (porDia[a.data] ||= []).push(a);

  lista.innerHTML = Object.keys(porDia).map((dia) => {
    const itens = porDia[dia];
    const linhas = itens.map((a) => `
      <article class="alerta ${eSaida(a) ? "saida" : "entrada"}">
        <span class="seta" aria-label="${eSaida(a) ? "Saída" : "Entrada"}">${eSaida(a) ? "↓" : "↑"}</span>
        <div>
          <p class="nome"><span class="selo ${a.grupo}">${NOME_GRUPO[a.grupo] || a.grupo}</span>${protegido(a.nome)}</p>
          <p class="texto">${protegido(a.mensagem)}</p>
          <div class="barra"><i style="width:${largura(a.valor)}%"></i></div>
        </div>
      </article>`).join("");
    const contagem = itens.length === 1 ? "1 alerta" : `${itens.length} alertas`;
    return `<div class="dia"><h3>${dataBR(dia)} <span>${contagem}</span></h3>${linhas}</div>`;
  }).join("");
}

// ---------- BOTOES DE FILTRO ----------
function ligarBotoes(idCaixa, aoClicar) {
  const caixa = document.getElementById(idCaixa);
  caixa.addEventListener("click", (evento) => {
    const botao = evento.target.closest("button");
    if (!botao) return;
    caixa.querySelectorAll("button").forEach((b) => b.classList.remove("ativo"));
    botao.classList.add("ativo");
    aoClicar(botao);
    desenharLista();
  });
}

ligarBotoes("filtro-grupo", (b) => { filtroGrupo = b.dataset.grupo; });
ligarBotoes("filtro-tipo", (b) => { filtroTipo = b.dataset.tipo; });

carregar();
