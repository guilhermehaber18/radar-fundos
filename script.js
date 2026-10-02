// =============================================================
// Vitrine do Radar de Fundos (parte 1: abas, alertas e pesquisa)
// A pagina do fundo com os graficos fica no arquivo fundo.js
// =============================================================

// ---------- MEMORIA DO SITE ----------
let todosAlertas = [];
let totalFundos = null;
let alertasCarregados = false;
let filtroGrupo = "todos";
let filtroTipo = "todos";
let buscaGrupo = "";
let buscaClasse = "";
let esperaBusca = null;

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

function reais(valor) {             // 32891575799 -> "R$ 32,9 bi"
  if (valor == null || isNaN(valor)) return "–";
  const v = Math.abs(valor), sinal = valor < 0 ? "−" : "";
  const fmt = (n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  if (v >= 1e9) return `${sinal}R$ ${fmt(v / 1e9)} bi`;
  if (v >= 1e6) return `${sinal}R$ ${fmt(v / 1e6)} mi`;
  if (v >= 1e3) return `${sinal}R$ ${Math.round(v / 1e3).toLocaleString("pt-BR")} mil`;
  return `${sinal}R$ ${Math.round(v).toLocaleString("pt-BR")}`;
}

function cnpjBonito(c) {            // "09215250000113" -> "09.215.250/0001-13"
  return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function selo(grupo) {
  return `<span class="selo ${protegido(grupo)}">${NOME_GRUPO[grupo] || protegido(grupo)}</span>`;
}

function eSaida(alerta) {            // resgate fora do normal e saida continua sao "saidas"
  return alerta.tipo !== "captacao_atipica";
}

// baixa uma tabela como arquivo CSV, que o Excel abre direto (separador ; e virgula decimal)
function baixarCSV(nome, cabecalho, linhas) {
  const celula = (v) => {
    if (v == null) return "";
    if (typeof v === "number") return String(Math.round(v * 100) / 100).replace(".", ",");
    const t = String(v);
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const texto = "\uFEFF" + [cabecalho, ...linhas].map((l) => l.map(celula).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = nome;
  document.body.appendChild(link); link.click(); link.remove();
  URL.revokeObjectURL(url);
}
const porCento = (x) => (x == null ? null : x * 100);

function alertasFiltrados() {
  return todosAlertas.filter((a) =>
    (filtroGrupo === "todos" || a.grupo === filtroGrupo) &&
    (filtroTipo === "todos" || a.tipo === filtroTipo || (filtroTipo === "saidas" && eSaida(a))));
}

// ---------- ABAS (o "endereco" depois do # diz qual tela mostrar) ----------
function mostrarTela(nome) {
  for (const t of ["alertas", "pesquisa", "categorias", "comparar", "rivais", "fundo"]) {
    document.getElementById(`tela-${t}`).hidden = t !== nome;
  }
  document.querySelectorAll(".abas a").forEach((a) => {
    a.classList.toggle("ativo", a.dataset.aba === nome);
  });
}

function rotear() {
  const endereco = location.hash.slice(1);          // ex.: "fundo/09215250000113"
  if (endereco.startsWith("fundo/")) {
    mostrarTela("fundo");
    abrirFundo(endereco.split("/")[1]);              // funcao do fundo.js
  } else if (endereco.startsWith("categorias")) {
    mostrarTela("categorias");
    abrirCategorias(endereco.split("/").slice(1));     // funcao do categorias-tela.js
  } else if (endereco.startsWith("comparar")) {
    mostrarTela("comparar");
    abrirComparar((endereco.split("/")[1] || "").split(",").filter(Boolean));   // funcao do comparar.js
  } else if (endereco === "rivais") {
    mostrarTela("rivais");
    abrirRivais();                                    // funcao do comparar.js
  } else if (endereco === "pesquisa") {
    mostrarTela("pesquisa");
    if (!document.getElementById("resultados").children.length) pesquisar();
    document.getElementById("busca").focus();
  } else {
    mostrarTela("alertas");
  }
  window.scrollTo(0, 0);
}

// ---------- ALERTAS ----------
async function carregarAlertas() {
  try {
    const resposta = await fetch("/api/alertas");
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || `erro ${resposta.status}`);
    todosAlertas = dados.alertas;
    totalFundos = dados.totalFundos;
    alertasCarregados = true;
    desenharInfo();
    desenharDestaque();
    desenharLista();
  } catch (erro) {
    document.getElementById("info").textContent = "";
    document.getElementById("lista").innerHTML =
      `<p class="erro">Não consegui carregar os alertas (${protegido(erro.message)}). Atualize a página em alguns minutos.</p>`;
  }
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
  const maior = todosAlertas[0];      // a lista ja vem ordenada por data e valor
  caixa.className = "destaque " + (eSaida(maior) ? "saida" : "entrada");
  caixa.innerHTML = `
    <p class="quando">Maior movimento fora do normal em ${dataBR(maior.data)}</p>
    <h2><a href="#fundo/${maior.cnpj}">${protegido(maior.nome)}</a></h2>
    <p class="mensagem">${selo(maior.grupo)}${protegido(maior.mensagem)}</p>
  `;
}

// tambem usada na pagina do fundo
function linhaAlerta(a, maiorValor, comNome = true) {
  const largura = Math.max(2, Math.round(100 * Math.sqrt(a.valor / maiorValor)));
  const nome = comNome
    ? `<p class="nome">${selo(a.grupo)}<a href="#fundo/${a.cnpj}">${protegido(a.nome)}</a></p>` : "";
  return `
    <article class="alerta ${eSaida(a) ? "saida" : "entrada"}">
      <span class="seta" aria-label="${eSaida(a) ? "Saída" : "Entrada"}">${eSaida(a) ? "↓" : "↑"}</span>
      <div>
        ${nome}
        <p class="texto">${protegido(a.mensagem)}</p>
        <div class="barra"><i style="width:${largura}%"></i></div>
      </div>
    </article>`;
}

function desenharLista() {
  const lista = document.getElementById("lista");
  const filtrados = alertasFiltrados();
  if (!filtrados.length) {
    lista.innerHTML = `<p class="vazio">Nenhum alerta com esses filtros. Experimente outro grupo ou tipo.</p>`;
    return;
  }
  const maiorValor = Math.max(...filtrados.map((a) => a.valor));
  const porDia = {};
  for (const a of filtrados) (porDia[a.data] ||= []).push(a);

  lista.innerHTML = Object.keys(porDia).map((dia) => {
    const itens = porDia[dia];
    const contagem = itens.length === 1 ? "1 alerta" : `${itens.length} alertas`;
    return `<div class="dia"><h3>${dataBR(dia)} <span>${contagem}</span></h3>
      ${itens.map((a) => linhaAlerta(a, maiorValor)).join("")}</div>`;
  }).join("");
}

// ---------- PESQUISA ----------
async function pesquisar() {
  const texto = document.getElementById("busca").value.trim();
  const info = document.getElementById("busca-info");
  const lista = document.getElementById("resultados");
  lista.classList.add("carregando");
  try {
    const url = `/api/pesquisa?q=${encodeURIComponent(texto)}&grupo=${encodeURIComponent(buscaGrupo)}&classe=${encodeURIComponent(buscaClasse)}`;
    const resposta = await fetch(url);
    const fundos = await resposta.json();
    if (!resposta.ok) throw new Error(fundos.erro || `erro ${resposta.status}`);

    if (!fundos.length) {
      info.textContent = "";
      lista.innerHTML = `<li class="vazio">Nenhum fundo encontrado. Tente menos palavras ou só o nome da gestora.</li>`;
      return;
    }
    info.textContent = texto
      ? `${fundos.length === 30 ? "Os 30 maiores" : fundos.length} resultados, do maior para o menor.`
      : "Os 30 maiores fundos. Digite para procurar.";
    lista.innerHTML = fundos.map((f) => `
      <li>
        <a href="#fundo/${f.cnpj}">
          <span class="res-nome">${selo(f.grupo)}${protegido(f.nome)}</span>
          <span class="res-detalhe">${f.classificacao_anbima || f.classificacao ? protegido(f.classificacao_anbima || f.classificacao) + "<br>" : ""}${protegido(f.gestor)}<br>CNPJ ${cnpjBonito(f.cnpj)}</span>
          <span class="res-pl num">${reais(f.patrimonio)}</span>
        </a>
      </li>`).join("");
  } catch (erro) {
    info.textContent = "";
    lista.innerHTML = `<li class="erro">Não consegui pesquisar (${protegido(erro.message)}). Tente de novo.</li>`;
  } finally {
    lista.classList.remove("carregando");
  }
}

// ---------- BOTOES ----------
function ligarBotoes(idCaixa, aoClicar) {
  const caixa = document.getElementById(idCaixa);
  caixa.addEventListener("click", (evento) => {
    const botao = evento.target.closest("button");
    if (!botao) return;
    caixa.querySelectorAll("button").forEach((b) => b.classList.remove("ativo"));
    botao.classList.add("ativo");
    aoClicar(botao);
  });
}

function iniciar() {
  ligarBotoes("filtro-grupo", (b) => { filtroGrupo = b.dataset.grupo; desenharLista(); });
  ligarBotoes("filtro-tipo", (b) => { filtroTipo = b.dataset.tipo; desenharLista(); });
  document.getElementById("baixar-alertas").addEventListener("click", () => {
    const nomeTipo = { resgate_atipico: "Resgate fora do normal", captacao_atipica: "Captação fora do normal", sangria: "Saída contínua" };
    baixarCSV("radar-alertas.csv", ["Data", "Grupo", "Fundo", "CNPJ", "Tipo", "Valor (R$)", "Descrição"],
      alertasFiltrados().map((a) => [dataBR(a.data), NOME_GRUPO[a.grupo] || a.grupo, a.nome, cnpjBonito(a.cnpj), nomeTipo[a.tipo] || a.tipo, a.valor, a.mensagem]));
  });
  ligarBotoes("busca-grupo", (b) => { buscaGrupo = b.dataset.grupo; pesquisar(); });
  ligarBotoes("busca-classe", (b) => { buscaClasse = b.dataset.classe; pesquisar(); });

  // pesquisa enquanto digita, esperando a pessoa parar por 0,3 segundo
  document.getElementById("busca").addEventListener("input", () => {
    clearTimeout(esperaBusca);
    esperaBusca = setTimeout(pesquisar, 300);
  });

  window.addEventListener("hashchange", rotear);
  carregarAlertas();
  rotear();
}

window.addEventListener("DOMContentLoaded", iniciar);
