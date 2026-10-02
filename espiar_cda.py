# =============================================================
# Espiao da carteira dos fundos (CDA) - Dia 16
# So OLHA o arquivo da CVM e mostra o que tem dentro. Nao grava nada no banco.
# Queremos descobrir: em qual arquivo e em quais colunas a CVM diz
# "este fundo tem cotas DAQUELE outro fundo".
# =============================================================

import io
import zipfile
from datetime import date

import pandas as pd
import requests

ENDERECO = "https://dados.cvm.gov.br/dados/FI/DOC/CDA/DADOS/cda_fi_{}.zip"

def achar_mes_mais_recente():
    # a carteira sai com uns 3 meses de atraso: tenta do mes atual para tras
    hoje = date.today()
    ano, mes = hoje.year, hoje.month
    for _ in range(12):
        aaaamm = f"{ano}{mes:02d}"
        r = requests.get(ENDERECO.format(aaaamm), timeout=600)
        if r.status_code == 200 and len(r.content) > 20_000_000:
            return aaaamm, r.content
        motivo = "ainda quase vazio" if r.status_code == 200 else "ainda nao publicado"
        print(f"  {aaaamm}: {motivo} ({len(r.content) / 1e6:.1f} MB)")
        mes -= 1
        if mes == 0:
            ano, mes = ano - 1, 12
    raise SystemExit("Nao achei nenhum arquivo de carteira nos ultimos 12 meses.")

print("Procurando o arquivo de carteiras mais recente (pode demorar 1 a 3 minutos)...")
aaaamm, conteudo = achar_mes_mais_recente()
print(f"\nACHEI: mes {aaaamm}, tamanho {len(conteudo) / 1e6:.0f} MB\n")

pacote = zipfile.ZipFile(io.BytesIO(conteudo))
for nome in pacote.namelist():
    with pacote.open(nome) as arq:
        df = pd.read_csv(arq, sep=";", encoding="latin1", dtype=str, low_memory=False)
    print("=" * 70)
    print(f"ARQUIVO: {nome}   ({len(df)} linhas)")
    suspeitas = [c for c in df.columns if "COTA" in c.upper()]
    if not suspeitas:
        continue  # so detalhamos os arquivos que falam de cotas de outros fundos
    print("COLUNAS: " + " | ".join(df.columns))
    if "TP_APLIC" in df.columns:
        print("TIPOS DE APLICACAO (os 6 mais comuns):")
        for tipo, qtd in df["TP_APLIC"].value_counts().head(6).items():
            print(f"   {qtd:>8}  {tipo}")
    if suspeitas:
        print(f">>> COLUNAS COM 'COTA' NO NOME: {suspeitas}")
        cheias = df[df[suspeitas[0]].notna()]
        print(f">>> linhas com essa coluna preenchida: {len(cheias)}")
        if len(cheias):
            print(">>> EXEMPLO DE UMA LINHA:")
            for col, val in cheias.iloc[0].items():
                print(f"      {col} = {val}")
print("=" * 70)
print("FIM. Mande print de tudo a partir de 'ACHEI'.")
