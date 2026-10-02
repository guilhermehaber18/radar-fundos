# =============================================================
# Robo de coleta do Radar de Fundos
# Baixa os dados abertos da CVM, separa os fundos de BTG, Itau,
# XP e Bradesco e guarda tudo no Supabase.
# As chaves vem das variaveis SUPABASE_URL e SUPABASE_SECRET_KEY
# (nunca escritas neste arquivo).
# =============================================================

import io, os, re, sys, unicodedata, zipfile
from datetime import date, timedelta
import pandas as pd
import requests
from alertas import gerar_alertas, um_por_dia, JANELA

# ---------- CONFIGURACAO ----------
CVM = "https://dados.cvm.gov.br/dados/FI"
URL_CADASTRO = f"{CVM}/CAD/DADOS/registro_fundo_classe.zip"
URL_INFORME = f"{CVM}/DOC/INF_DIARIO/DADOS/inf_diario_fi_{{mes}}.zip"
MESES = int(os.environ.get("MESES", "4"))  # quantos meses baixar (o atual e os anteriores)
GUARDAR_DIAS = 400                         # faxina: apaga o que for mais antigo que isso

GRUPOS = {
    "BTG":      r"\bBTG",
    "Itau":     r"\bITAU\b|\bKINEA\b",
    "XP":       r"\bXP\b",
    "Bradesco": r"\bBRADESCO\b",
}

# ---------- FERRAMENTAS PEQUENAS ----------
def limpar(texto):  # "Itaú" -> "ITAU"
    texto = unicodedata.normalize("NFKD", str(texto))
    return "".join(c for c in texto if not unicodedata.combining(c)).upper()

def so_numeros(cnpj):  # "00.017.024/0001-53" -> "00017024000153"
    return re.sub(r"\D", "", str(cnpj)).zfill(14)

def baixar_zip(url):  # o "entregador": busca o pacote e devolve aberto
    print("Baixando", url)
    r = requests.get(url, timeout=300)
    r.raise_for_status()
    return zipfile.ZipFile(io.BytesIO(r.content))

def ler_csv(pacote, nome, **extra):
    return pd.read_csv(pacote.open(nome), sep=";", encoding="latin1", dtype=str, **extra)

def meses_para_baixar():  # ex.: ["202610", "202609"]
    hoje = date.today()
    ano, mes = hoje.year, hoje.month
    lista = []
    for _ in range(MESES):
        lista.append(f"{ano}{mes:02d}")
        mes -= 1
        if mes == 0:
            ano, mes = ano - 1, 12
    return lista

# ---------- CONVERSA COM O SUPABASE ----------
def enviar(tabela, linhas, chave_unica):
    url = os.environ["SUPABASE_URL"].rstrip("/") + f"/rest/v1/{tabela}?on_conflict={chave_unica}"
    cabecalho = {
        "apikey": os.environ["SUPABASE_SECRET_KEY"],
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",  # upsert
    }
    for i in range(0, len(linhas), 1000):  # manda de 1.000 em 1.000 (caixas menores)
        caixa = linhas[i:i + 1000]
        r = requests.post(url, json=caixa, headers=cabecalho, timeout=120)
        if r.status_code >= 300:
            raise RuntimeError(f"Supabase recusou ({r.status_code}): {r.text[:300]}")
    print(f"  {tabela}: {len(linhas)} linhas enviadas")

def apagar(tabela, filtro):  # ex.: apagar("alertas", "data=gte.2026-08-01")
    url = os.environ["SUPABASE_URL"].rstrip("/") + f"/rest/v1/{tabela}?{filtro}"
    r = requests.delete(url, headers={"apikey": os.environ["SUPABASE_SECRET_KEY"]}, timeout=120)
    if r.status_code >= 300:
        raise RuntimeError(f"Supabase recusou ({r.status_code}): {r.text[:300]}")

def buscar(caminho):  # le do Supabase em "paginas" de 1.000 linhas
    linhas, inicio = [], 0
    while True:
        url = os.environ["SUPABASE_URL"].rstrip("/") + f"/rest/v1/{caminho}&limit=1000&offset={inicio}"
        r = requests.get(url, headers={"apikey": os.environ["SUPABASE_SECRET_KEY"]}, timeout=120)
        if r.status_code >= 300:
            raise RuntimeError(f"Supabase recusou ({r.status_code}): {r.text[:300]}")
        pagina = r.json()
        linhas += pagina
        if len(pagina) < 1000:
            return linhas
        inicio += 1000

def para_linhas(df):  # tabela do pandas -> lista de dicionarios (vazio vira null)
    return df.astype(object).where(df.notna(), None).to_dict(orient="records")

# ---------- PARTE 1: LISTA DE FUNDOS ----------
def montar_lista():
    pacote = baixar_zip(URL_CADASTRO)
    fundos = ler_csv(pacote, "registro_fundo.csv")[["ID_Registro_Fundo", "Gestor"]]
    classes = ler_csv(pacote, "registro_classe.csv")
    tudo = classes.merge(fundos, on="ID_Registro_Fundo", how="left")
    tudo = tudo[(tudo["Situacao"] == "Em Funcionamento Normal") & (tudo["Exclusivo"] != "S")].copy()

    tudo["grupo"] = None
    gestor_limpo = tudo["Gestor"].map(limpar)
    for grupo, padrao in GRUPOS.items():
        tudo.loc[gestor_limpo.str.contains(padrao, regex=True, na=False), "grupo"] = grupo
    radar = tudo[tudo["grupo"].notna()].copy()

    radar["cnpj"] = radar["CNPJ_Classe"].map(so_numeros)
    radar = radar.rename(columns={"Gestor": "gestor", "Denominacao_Social": "nome"})
    # ficha do fundo (vem do cadastro da CVM): usada pela IA para dizer o que o fundo e
    ficha = {"Tipo_Classe": "tipo_classe", "Classificacao": "classificacao", "Classificacao_Anbima": "classificacao_anbima",
             "Publico_Alvo": "publico_alvo", "Indicador_Desempenho": "indicador_desempenho",
             "Forma_Condominio": "forma_condominio", "Data_Inicio": "data_inicio"}
    for original, novo in ficha.items():
        radar[novo] = radar[original] if original in radar else None
    radar = radar[["cnpj", "grupo", "gestor", "nome"] + list(ficha.values())].drop_duplicates("cnpj")
    # texto de busca sem acentos: "BTG PACTUAL ... ITAU ..." (para a aba Pesquisa)
    radar["busca"] = (radar["nome"].fillna("") + " " + radar["gestor"].fillna("") + " " + radar["grupo"]).map(limpar)
    print(f"Lista do Radar: {len(radar)} fundos")
    return radar

# ---------- PARTE 2: INFORMES DIARIOS ----------
def ler_informes(cnpjs_do_radar):
    partes = []
    for mes in meses_para_baixar():
        try:
            pacote = baixar_zip(URL_INFORME.format(mes=mes))
        except requests.HTTPError:
            print(f"  Mes {mes} ainda nao publicado, pulando")
            continue
        df = ler_csv(pacote, pacote.namelist()[0], keep_default_na=False)
        coluna_cnpj = "CNPJ_FUNDO_CLASSE" if "CNPJ_FUNDO_CLASSE" in df else "CNPJ_FUNDO"  # arquivos antigos
        df["cnpj"] = df[coluna_cnpj].map(so_numeros)
        partes.append(df[df["cnpj"].isin(cnpjs_do_radar)])

    inf = pd.concat(partes)
    if "ID_SUBCLASSE" not in inf:
        inf["ID_SUBCLASSE"] = ""
    inf = pd.DataFrame({
        "cnpj":       inf["cnpj"],
        "subclasse":  inf["ID_SUBCLASSE"].fillna(""),
        "data":       inf["DT_COMPTC"],
        "cota":       pd.to_numeric(inf["VL_QUOTA"], errors="coerce"),
        "patrimonio": pd.to_numeric(inf["VL_PATRIM_LIQ"], errors="coerce"),
        "captacao":   pd.to_numeric(inf["CAPTC_DIA"], errors="coerce"),
        "resgate":    pd.to_numeric(inf["RESG_DIA"], errors="coerce"),
        "cotistas":   pd.to_numeric(inf["NR_COTST"], errors="coerce").astype("Int64"),
    })
    inf = inf.drop_duplicates(["cnpj", "subclasse", "data"], keep="last")
    print(f"Informes encontrados: {len(inf)} linhas, ultima data {inf['data'].max()}")
    return inf

# ---------- PARTE 3: ULTIMA FOTO DE CADA FUNDO ----------
def juntar_ultima_foto(radar, informes):
    # pega o patrimonio do dia mais recente de cada fundo (para ordenar a pesquisa)
    ultimo = um_por_dia(informes).groupby("cnpj").tail(1)[["cnpj", "data", "patrimonio"]]
    ultimo = ultimo.rename(columns={"data": "data_pl"})
    return radar.merge(ultimo, on="cnpj", how="left")

# ---------- PARTE 3b: RENDIMENTO E CAPTACAO DE CADA FUNDO (para a aba Categorias) ----------
def cotas_por_dia(df):
    # uma cota por fundo por dia: a linha "geral" do fundo ou, se nao houver, a da maior subclasse
    df = df[df["cota"].notna() & (df["cota"] > 0)].copy()
    df["geral"] = df["subclasse"] == ""
    df = df.sort_values(["cnpj", "data", "geral", "patrimonio"])
    return df.drop_duplicates(["cnpj", "data"], keep="last")[["cnpj", "data", "cota"]]

def juntar_metricas(radar, informes):
    cotas = cotas_por_dia(informes)
    hoje = date.fromisoformat(informes["data"].max())
    inicio_janela = informes["data"].min()
    atras = lambda dias: (hoje - timedelta(days=dias)).isoformat()

    fim = cotas.groupby("cnpj").tail(1).rename(columns={"cota": "cota_fim", "data": "data_fim"})
    fim = fim[fim["data_fim"] >= atras(10)]            # so fundos com cota recente

    FOLGA = 7   # a janela baixada comeca no dia 1 do mes: aceitamos ate 7 dias de diferenca do alvo

    def rendimento(dias, tabela):
        # cota de referencia: o dia mais proximo do alvo (de preferencia antes; se nao houver, logo depois)
        perto = tabela[tabela["data"] <= atras(dias - FOLGA)]
        antes = perto[perto["data"] <= atras(dias)].groupby("cnpj").tail(1)
        depois = perto[perto["data"] > atras(dias)].groupby("cnpj").head(1)
        ref = pd.concat([antes, depois]).drop_duplicates("cnpj", keep="first")[["cnpj", "cota"]]
        junto = fim.merge(ref, on="cnpj").set_index("cnpj")
        return junto["cota_fim"] / junto["cota"] - 1

    metricas = pd.DataFrame(index=radar["cnpj"])
    metricas["rend_1m"] = rendimento(31, cotas) if inicio_janela <= atras(31 - FOLGA) else None
    metricas["rend_3m"] = rendimento(92, cotas) if inicio_janela <= atras(92 - FOLGA) else None

    # 12 meses: a cota de um ano atras vem da janela baixada (se ela for longa) ou do Supabase
    try:
        if inicio_janela <= atras(360):
            antigas = cotas[cotas["data"] <= atras(358)]
        else:
            linhas = buscar("informes?select=cnpj,subclasse,data,cota,patrimonio"
                            f"&data=gte.{atras(372)}&data=lte.{atras(358)}&order=cnpj.asc,data.asc,subclasse.asc")
            antigas = cotas_por_dia(pd.DataFrame(linhas)) if linhas else cotas.iloc[0:0]
        ref = antigas.groupby("cnpj").head(1)[["cnpj", "cota"]]      # o dia mais antigo perto de 1 ano atras
        junto = fim.merge(ref, on="cnpj").set_index("cnpj")
        metricas["rend_12m"] = junto["cota_fim"] / junto["cota"] - 1
    except Exception as erro:
        print("  Aviso: nao consegui calcular o rendimento de 12 meses:", erro)
        metricas["rend_12m"] = None

    # entradas menos saidas nos ultimos 3 meses
    if inicio_janela <= atras(92 - FOLGA):
        dia = um_por_dia(informes)
        dia = dia[dia["data"] > atras(92)]
        metricas["liq_3m"] = (dia["captacao"].fillna(0) - dia["resgate"].fillna(0)).groupby(dia["cnpj"]).sum()
    else:
        metricas["liq_3m"] = None

    metricas = metricas.astype(float).replace([float("inf"), float("-inf")], float("nan")).reset_index()
    print(f"Metricas: {metricas['rend_3m'].notna().sum()} fundos com rendimento de 3 meses, "
          f"{metricas['rend_12m'].notna().sum()} com 12 meses")
    return radar.merge(metricas, on="cnpj", how="left")

# ---------- PARTE 3c: POSICAO DO FUNDO NA CATEGORIA ----------
def juntar_posicoes(radar):
    # compara cada fundo com os da mesma subcategoria (Anbima); se ela tiver menos de 10 fundos, usa a categoria da CVM
    r = radar.copy()
    elegivel = (r["patrimonio"] >= 50_000_000) & r["classificacao"].notna()
    tamanho_sub = r[elegivel].groupby("classificacao_anbima")["cnpj"].transform("count")
    r["cat_base"] = None
    r.loc[elegivel, "cat_base"] = r.loc[elegivel, "classificacao"]
    usar_sub = elegivel & r["classificacao_anbima"].notna()
    usar_sub.loc[elegivel] &= (tamanho_sub.reindex(r.index[elegivel]).fillna(0) >= 10).values
    r.loc[usar_sub, "cat_base"] = r.loc[usar_sub, "classificacao_anbima"]

    for prazo in ["3m", "12m"]:
        valido = r[elegivel & r[f"rend_{prazo}"].notna()]
        # posicao dentro da subcategoria e dentro da categoria inteira (1 = quem mais rendeu)
        na_sub = valido.groupby("classificacao_anbima")[f"rend_{prazo}"]
        na_classe = valido.groupby("classificacao")[f"rend_{prazo}"]
        pos = na_classe.rank(ascending=False, method="min")
        n = na_classe.transform("count")
        pela_sub = usar_sub.reindex(valido.index)
        pos[pela_sub] = na_sub.rank(ascending=False, method="min")[pela_sub]
        n[pela_sub] = na_sub.transform("count")[pela_sub]
        r[f"pos_{prazo}"] = pos.astype("Int64")
        r[f"n_{prazo}"] = n.astype("Int64")
    print(f"Posicoes: {r['pos_12m'].notna().sum()} fundos com posicao de 12 meses na categoria")
    return r

# ---------- PARTE 4: RESUMO POR GRUPO (BTG x Itau x XP x Bradesco) ----------
def resumir_grupos(radar, informes):
    # soma, para cada grupo e cada dia, o patrimonio, as entradas e as saidas de todos os fundos
    dia = um_por_dia(informes).merge(radar[["cnpj", "grupo"]], on="cnpj", how="left")
    resumo = dia.groupby(["grupo", "data"], as_index=False).agg(
        patrimonio=("patrimonio", "sum"), captacao=("captacao", "sum"),
        resgate=("resgate", "sum"), fundos=("cnpj", "count"))
    print(f"Resumo por grupo: {len(resumo)} linhas")
    return resumo

def resumir_classes(radar, informes):
    # o mesmo resumo, separado por categoria (Renda Fixa, Multimercado, Acoes)
    com_classe = radar[radar["classificacao"].notna()][["cnpj", "grupo", "classificacao"]]
    dia = um_por_dia(informes).merge(com_classe, on="cnpj", how="inner").rename(columns={"classificacao": "classe"})
    resumo = dia.groupby(["grupo", "classe", "data"], as_index=False).agg(
        patrimonio=("patrimonio", "sum"), captacao=("captacao", "sum"),
        resgate=("resgate", "sum"), fundos=("cnpj", "count"))
    print(f"Resumo por categoria: {len(resumo)} linhas")
    return resumo

# ---------- O ROBO TRABALHANDO ----------
if __name__ == "__main__":
    for nome in ["SUPABASE_URL", "SUPABASE_SECRET_KEY"]:
        if not os.environ.get(nome):
            sys.exit(f"ERRO: falta a chave {nome}. Use: set {nome}=...")

    radar = montar_lista()
    informes = ler_informes(set(radar["cnpj"]))
    radar = juntar_ultima_foto(radar, informes)
    radar = juntar_metricas(radar, informes)
    radar = juntar_posicoes(radar)

    enviar("fundos", para_linhas(radar), "cnpj")
    enviar("informes", para_linhas(informes), "cnpj,subclasse,data")

    enviar("resumo_grupos", para_linhas(resumir_grupos(radar, informes)), "grupo,data")
    enviar("resumo_classes", para_linhas(resumir_classes(radar, informes)), "grupo,classe,data")

    # Os primeiros dias baixados nao tem "ultimo mes" completo para comparar.
    # Por isso so mexemos nos alertas a partir do dia em que o historico ja esta completo;
    # os alertas mais antigos, calculados em rodadas anteriores, ficam como estao.
    alertas = gerar_alertas(informes, radar)
    dias_baixados = sorted(informes["data"].unique())
    if len(dias_baixados) > JANELA:
        inicio = dias_baixados[JANELA]
        alertas = alertas[alertas["data"] >= inicio]
        apagar("alertas", f"data=gte.{inicio}")
        enviar("alertas", para_linhas(alertas), "cnpj,data,tipo")
        print(f"  (alertas atualizados de {inicio} em diante)")
    else:
        print("  Poucos dias baixados: alertas nao foram alterados")

    # Faxina: a geladeira guarda pouco mais de 1 ano
    limite = (date.today() - timedelta(days=GUARDAR_DIAS)).isoformat()
    for tabela in ["informes", "alertas", "resumo_grupos", "resumo_classes"]:
        apagar(tabela, f"data=lt.{limite}")
    print(f"Faxina: apagado o que era anterior a {limite}")

    print("Pronto! Coleta concluida.")
