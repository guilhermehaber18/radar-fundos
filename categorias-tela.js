// =============================================================
// Vitrine do Radar de Fundos (parte 4: categorias)
// - Aba Categorias: fundos da mesma categoria lado a lado, com ordenacao e selecao para comparar
// - "Fundos parecidos" na pagina do fundo
// =============================================================

let listaCategorias = null;          // [{classe, fundos, subcategorias:[{nome, fundos}]}]
let catClasse = "Renda Fixa", catSub = "", catGrupo = "", catOrdem = "patrimonio";
let marcados = [];                   // CNPJs marcados para comparar (ate 4)

const COLUNAS_CAT = [
  ["patrimonio", "Patrimônio", (f) => reais(f.patrimonio)],
  ["rend_1m", "Rendeu em 1 mês", (f) => pct(f.rend_1m)],
  ["rend_3m", "Rendeu em 3 meses", (f) => pct(f.rend_3m)],
  ["rend_12m", "Rendeu em 12 meses", (f) => pct(f.rend_12m)],
  ["liq_3m", "Entradas menos saídas em 3 meses", (f) => reais(f.liq_3m)],
];

function enderecoCategoria(classe, sub) {
  return `#categorias/${encodeURIComponent(classe)}${sub ? "/" + encodeURIComponent(sub) : ""}`;
}

async function abrirCategorias(partes) {
  const tela = document.getElementById("tela-categorias");
  try {
    if (!listaCategorias) {
      tela.innerHTML = `<p class="info">Carregando as categorias…</p>`;
      const r = await fetch("/api/categorias");
      const d = await r.json();
      if (!r.ok) throw new Error(d.erro || `erro ${r.status}`);
      listaCategorias = d;
    }
    const classe = partes[0] ? decodeURIComponent(partes[0]) : catClasse;
    if (listaCategorias.some((c) => c.classe === classe)) {
      if (classe !== catClasse || partes[0]) catSub = partes[1] ? decodeURIComponent(partes[1]) : "";
      catClasse = classe;
    }
    desenharCategorias();
  } catch (erro) {
    tela.innerHTML = `<p class="erro">Não consegui carregar as categorias (${protegido(erro.message)}).</p>`;
  }
}

function desenharCategorias() {
  const tela = document.getElementById("tela-categorias");
  const atual = listaCategorias.find((c) => c.classe === catClasse);
  tela.innerHTML = `
    <h2 class="titulo-tela">Categorias</h2>
    <p class="subtitulo">Fundos do mesmo tipo, lado a lado. Marque até 4 para comparar.</p>
    <div class="filtros filtros-cat">
      <div class="grupo-botoes" id="cat-classe">
        ${listaCategorias.map((c) => `<button data-classe="${protegido(c.classe)}" class="${c.classe === catClasse ? "ativo" : ""}">${protegido(c.classe)} (${numero(c.fundos)})</button>`).join("")}
      </div>
      <div class="grupo-botoes" id="cat-grupo">
        ${[["", "Todos"], ["BTG", "BTG"], ["Itau", "Itaú"], ["XP", "XP"], ["Bradesco", "Bradesco"]].map(([g, nome]) =>
          `<button data-grupo="${g}" class="${g === catGrupo ? "ativo" : ""}">${nome}</button>`).join("")}
      </div>
    </div>
    <label class="rotulo-busca" for="cat-sub">Subcategoria (classificação Anbima)</label>
    <select id="cat-sub">
      <option value="">Todas as subcategorias</option>
      ${atual.subcategorias.map((s) => `<option value="${protegido(s.nome)}" ${s.nome === catSub ? "selected" : ""}>${protegido(s.nome)} (${numero(s.fundos)})</option>`).join("")}
    </select>
    <p class="info" id="cat-info"></p>
    <div id="cat-baixar"></div>
    <div id="cat-barra"></div>
    <div id="cat-tabela"><p class="info">Carregando os fundos…</p></div>
    <p class="nota-rodape">A categoria é a que a própria gestora registrou na CVM e na Anbima: fundos da mesma categoria ainda podem ter estratégias diferentes.
      Só entram fundos com pelo menos R$ 50 milhões. Rendimento passado não garante rendimento futuro, e isto não é recomendação de investimento.</p>`;

  ligarBotoes("cat-classe", (b) => { location.hash = enderecoCategoria(b.dataset.classe, ""); });
  ligarBotoes("cat-grupo", (b) => { catGrupo = b.dataset.grupo; carregarFundosDaCategoria(); });
  document.getElementById("cat-sub").addEventListener("change", (e) => { location.hash = enderecoCategoria(catClasse, e.target.value); });
  desenharBarraMarcados();
  carregarFundosDaCategoria();
}

async function carregarFundosDaCategoria() {
  const caixa = document.getElementById("cat-tabela");
  caixa.classList.add("carregando");
  try {
    const p = new URLSearchParams({ classe: catClasse, ordem: catOrdem });
    if (catSub) p.set("sub", catSub);
    if (catGrupo) p.set("grupo", catGrupo);
    const r = await fetch(`/api/categorias?${p}`);
    const fundos = await r.json();
    if (!r.ok) throw new Error(fundos.erro || `erro ${r.status}`);

    const nomeOrdem = COLUNAS_CAT.find((c) => c[0] === catOrdem)[1].toLowerCase();
    document.getElementById("cat-info").textContent = fundos.length
      ? `${fundos.length === 100 ? "Os 100 primeiros" : fundos.length + " fundos"}, ordenados por ${nomeOrdem}. Clique no título de uma coluna para mudar a ordem.`
      : "";
    if (!fundos.length) { caixa.innerHTML = `<p class="vazio">Nenhum fundo com esses filtros.</p>`; return; }

    caixa.innerHTML = `<div class="rolagem tabela-comparar tabela-cat"><table>
      <thead><tr><th>Comparar</th><th>Fundo</th>
        ${COLUNAS_CAT.map(([id, nome]) => `<th><button class="ordenar ${id === catOrdem ? "ativo" : ""}" data-ordem="${id}">${nome}${id === catOrdem ? " ↓" : ""}</button></th>`).join("")}
      </tr></thead>
      <tbody>${fundos.map((f) => `<tr>
        <td><input type="checkbox" class="marcar" data-cnpj="${f.cnpj}" ${marcados.includes(f.cnpj) ? "checked" : ""}
          aria-label="Marcar ${protegido(f.nome)} para comparar"></td>
        <td>${selo(f.grupo)}<a href="#fundo/${f.cnpj}">${protegido(f.nome)}</a>
          ${f.classificacao_anbima && !catSub ? `<span class="data-pequena">${protegido(f.classificacao_anbima)}</span>` : ""}</td>
        ${COLUNAS_CAT.map(([, , valor]) => `<td>${valor(f)}</td>`).join("")}
      </tr>`).join("")}</tbody></table></div>`;

    document.getElementById("cat-baixar").innerHTML = `<button id="baixar-cat" class="baixar">Baixar esta lista em Excel</button>`;
    document.getElementById("baixar-cat").addEventListener("click", () =>
      baixarCSV("radar-categoria.csv", ["Fundo", "CNPJ", "Grupo", "Categoria", "Subcategoria", "Patrimônio (R$)", "Rendeu em 1 mês (%)", "Rendeu em 3 meses (%)", "Rendeu em 12 meses (%)", "Entradas menos saídas em 3 meses (R$)"],
        fundos.map((f) => [f.nome, cnpjBonito(f.cnpj), NOME_GRUPO[f.grupo] || f.grupo, f.classificacao, f.classificacao_anbima, f.patrimonio, porCento(f.rend_1m), porCento(f.rend_3m), porCento(f.rend_12m), f.liq_3m])));

    caixa.querySelectorAll(".ordenar").forEach((b) =>
      b.addEventListener("click", () => { catOrdem = b.dataset.ordem; carregarFundosDaCategoria(); }));
    caixa.querySelectorAll(".marcar").forEach((c) => c.addEventListener("change", () => {
      if (c.checked && marcados.length >= 4) { c.checked = false; return; }
      marcados = c.checked ? [...marcados, c.dataset.cnpj] : marcados.filter((x) => x !== c.dataset.cnpj);
      desenharBarraMarcados();
    }));
  } catch (erro) {
    caixa.innerHTML = `<p class="erro">Não consegui carregar os fundos (${protegido(erro.message)}).</p>`;
  } finally {
    caixa.classList.remove("carregando");
  }
}

function desenharBarraMarcados() {
  const barra = document.getElementById("cat-barra");
  if (!barra) return;
  if (!marcados.length) { barra.innerHTML = ""; return; }
  barra.innerHTML = `<div class="barra-marcados">
    <span>${marcados.length} de 4 marcados</span>
    ${marcados.length >= 2 ? `<a class="botao-comparar" href="#comparar/${marcados.join(",")}">Comparar os marcados</a>` : `<span class="info">Marque mais um para comparar</span>`}
    <button class="tirar" id="limpar-marcados">Limpar</button></div>`;
  document.getElementById("limpar-marcados").addEventListener("click", () => {
    marcados = [];
    document.querySelectorAll(".marcar").forEach((c) => { c.checked = false; });
    desenharBarraMarcados();
  });
}

// ---------- POSICAO DO FUNDO NA CATEGORIA ----------
function faixaDaPosicao(pos, n) {
  const q = pos / n;
  if (q <= 0.10) return "entre os 10% que mais renderam";
  if (q <= 0.25) return "entre os 25% que mais renderam";
  if (q <= 0.50) return "na metade de cima";
  if (q <= 0.75) return "na metade de baixo";
  return "entre os 25% que menos renderam";
}

function quadroPosicao(f) {
  const linhas = [["3 meses", f.rend_3m, f.pos_3m, f.n_3m], ["12 meses", f.rend_12m, f.pos_12m, f.n_12m]]
    .filter(([, , pos, n]) => pos && n)
    .map(([prazo, rend, pos, n]) => `<tr><td>${prazo}</td><td>${pct(rend)}</td>
      <td>${numero(pos)}º de ${numero(n)}</td><td>${faixaDaPosicao(pos, n)}</td></tr>`).join("");
  if (!linhas) return "";
  return `
    <h3>Posição na categoria</h3>
    <p class="info">Comparado com os fundos de ${protegido(f.cat_base)} de BTG, Itaú, XP e Bradesco com pelo menos R$ 50 milhões. Não é o mercado inteiro.</p>
    <div class="rolagem tabela-comparar posicao"><table>
      <thead><tr><th>Prazo</th><th>Rendimento</th><th>Posição</th><th>Faixa</th></tr></thead>
      <tbody>${linhas}</tbody></table></div>`;
}

// ---------- FUNDOS PARECIDOS (na pagina do fundo) ----------
async function carregarParecidos() {
  const caixa = document.getElementById("parecidos");
  const f = fundoAtual?.fundo;
  if (!caixa || !f) return;
  if (!f.classificacao) { caixa.innerHTML = ""; return; }
  try {
    const p = new URLSearchParams({ classe: f.classificacao, ordem: "patrimonio", limite: "12" });
    if (f.classificacao_anbima) p.set("sub", f.classificacao_anbima);
    const r = await fetch(`/api/categorias?${p}`);
    const lista = await r.json();
    if (!r.ok) throw new Error(lista.erro);
    if (fundoAtual?.fundo.cnpj !== f.cnpj) return;                 // a pessoa ja abriu outro fundo
    const outros = lista.filter((x) => x.cnpj !== f.cnpj).slice(0, 6);
    const categoria = f.classificacao_anbima || f.classificacao;
    caixa.innerHTML = `
      ${quadroPosicao(f)}
      <h3>Fundos parecidos</h3>
      <p class="info">Os maiores da mesma categoria (${protegido(categoria)}). <a href="${enderecoCategoria(f.classificacao, f.classificacao_anbima || "")}">Ver todos</a></p>
      ${outros.length ? `<div class="rolagem tabela-comparar"><table>
        <thead><tr><th>Fundo</th><th>Patrimônio</th><th>Rendeu em 3 meses</th><th>Rendeu em 12 meses</th><th></th></tr></thead>
        <tbody>${outros.map((x) => `<tr><td>${selo(x.grupo)}<a href="#fundo/${x.cnpj}">${protegido(x.nome)}</a></td>
          <td>${reais(x.patrimonio)}</td><td>${pct(x.rend_3m)}</td><td>${pct(x.rend_12m)}</td>
          <td><a href="#comparar/${f.cnpj},${x.cnpj}">Comparar</a></td></tr>`).join("")}</tbody></table></div>`
        : `<p class="vazio">Não há outros fundos grandes nesta categoria.</p>`}`;
  } catch {
    caixa.innerHTML = "";
  }
}
