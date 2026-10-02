# =============================================================
# Conferencia da dupla contagem (Dia 16) - so olha, nao grava nada.
# Pergunta: por que CAIXA e SAFRA deram so 1%?
# Para cada uma, mostra em que tipo de fundo o dinheiro delas esta aplicado.
# =============================================================
import io, re, zipfile
import pandas as pd
import requests

CVM = "https://dados.cvm.gov.br/dados/FI"

def baixar(url):
    print("Baixando", url)
    r = requests.get(url, timeout=600)
    r.raise_for_status()
    return zipfile.ZipFile(io.BytesIO(r.content))

def ler(pacote, nome):
    return pd.read_csv(pacote.open(nome), sep=";", encoding="latin1", dtype=str, low_memory=False)

def numeros(c):
    return re.sub(r"\D", "", str(c)).zfill(14)

cad = ler(baixar(f"{CVM}/CAD/DADOS/registro_fundo_classe.zip"), "registro_classe.csv")
cad["cnpj"] = cad["CNPJ_Classe"].map(numeros)
cad = cad.drop_duplicates("cnpj").set_index("cnpj")

for mes in ["202608", "202606"]:
    pacote = baixar(f"{CVM}/DOC/CDA/DADOS/cda_fi_{mes}.zip")
    pl = ler(pacote, f"cda_fi_PL_{mes}.csv")
    cotas = ler(pacote, f"cda_fi_BLC_2_{mes}.csv")
    cotas["valor"] = pd.to_numeric(cotas["VL_MERC_POS_FINAL"], errors="coerce").fillna(0)
    cotas["alvo"] = cotas["CNPJ_FUNDO_CLASSE_COTA"].map(numeros)
    print("=" * 60)
    print(f"MES {mes}: {len(pl)} fundos entregaram a carteira; {len(cotas)} linhas de cotas")
    for casa in ["CAIXA", "SAFRA", "BTG"]:
        c = cotas[cotas["DENOM_SOCIAL"].fillna("").str.upper().str.startswith(casa)].copy()
        total = c["valor"].sum()
        print(f"\n  {casa}: {c['CNPJ_FUNDO_CLASSE'].nunique()} fundos com cotas de outros fundos, somando R$ {total / 1e9:.1f} bi")
        if not total:
            continue
        c["exclusivo"] = c["alvo"].map(cad["Exclusivo"]).fillna("nao achei no cadastro")
        c["categoria"] = c["alvo"].map(cad["Classificacao"]).fillna("nao achei no cadastro")
        c["situacao"] = c["alvo"].map(cad["Situacao"]).fillna("nao achei no cadastro")
        for coluna, titulo in [("exclusivo", "o fundo investido e exclusivo?"), ("categoria", "categoria do fundo investido"), ("situacao", "situacao do fundo investido")]:
            print(f"    {titulo}")
            partes = (100 * c.groupby(coluna)["valor"].sum() / total).sort_values(ascending=False).head(5)
            for nome, pct in partes.items():
                print(f"       {pct:5.1f}%  {nome}")
print("=" * 60)
print("FIM. Mande print de tudo.")
