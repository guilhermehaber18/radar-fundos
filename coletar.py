# =============================================================
# Robo de coleta do Radar de Fundos
# Baixa os dados abertos da CVM, separa os fundos de BTG, Itau,
# XP e Bradesco e guarda tudo no Supabase.
# As chaves vem das variaveis SUPABASE_URL e SUPABASE_SECRET_KEY
# (nunca escritas neste arquivo).
# =============================================================

import io, os, re, sys, unicodedata, zipfile
from datetime import date
import pandas as pd
import requests
from alertas import gerar_alertas, um_por_dia

# ---------- CONFIGURACAO ----------
CVM = "https://dados.cvm.gov.br/dados/FI"
URL_CADASTRO = f"{CVM}/CAD/DADOS/registro_fundo_classe.zip"
URL_INFORME = f"{CVM}/DOC/INF_DIARIO/DADOS/inf_diario_fi_{{mes}}.zip"
MESES = int(os.environ.get("MESES", "2"))  # quantos meses baixar (o atual e os anteriores)

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
    radar = radar[["cnpj", "grupo", "gestor", "nome"]].drop_duplicates("cnpj")
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

# ---------- O ROBO TRABALHANDO ----------
if __name__ == "__main__":
    for nome in ["SUPABASE_URL", "SUPABASE_SECRET_KEY"]:
        if not os.environ.get(nome):
            sys.exit(f"ERRO: falta a chave {nome}. Use: set {nome}=...")

    radar = montar_lista()
    informes = ler_informes(set(radar["cnpj"]))
    radar = juntar_ultima_foto(radar, informes)

    enviar("fundos", para_linhas(radar), "cnpj")
    enviar("informes", para_linhas(informes), "cnpj,subclasse,data")

    alertas = gerar_alertas(informes, radar)
    # apaga os alertas antigos do periodo e grava os novos (assim, se a regra mudar, tudo se atualiza)
    apagar("alertas", f"data=gte.{informes['data'].min()}")
    enviar("alertas", para_linhas(alertas), "cnpj,data,tipo")

    print("Pronto! Coleta concluida.")
