# =============================================================
# Cerebro do Radar de Fundos: a regra dos alertas
# Ideia: cada fundo tem a sua "temperatura normal" de resgates e
# captacoes. Quando um dia fica MUITO acima do normal DELE, vira alerta.
# =============================================================

import pandas as pd

# ---------- REGRAS (pode ajustar estes numeros) ----------
JANELA = 21           # quantos dias uteis anteriores formam o "normal" (~1 mes)
MIN_HISTORICO = 10    # precisa de pelo menos 10 dias de historia para julgar
DESVIOS = 3           # quanto acima do normal: media + 3 "oscilacoes tipicas"
MIN_VALOR = 10_000_000  # ignora movimentos menores que R$ 10 milhoes
MIN_PCT_PL = 0.03       # ignora movimentos menores que 3% do patrimonio
MIN_PL = 50_000_000     # so olha fundos com pelo menos R$ 50 milhoes
VEZES_MEDIA = 3       # precisa ser pelo menos 3x a media do ultimo mes

# Saida continua ("sangria"): varios dias seguidos saindo mais dinheiro do que entra
SANGRIA_DIAS = 5            # pelo menos 5 dias uteis seguidos
SANGRIA_PCT_PL = 0.05       # somando pelo menos 5% do patrimonio do fundo
SANGRIA_VALOR = 10_000_000  # e pelo menos R$ 10 milhoes

TIPOS = [  # (coluna, nome do alerta, palavra usada na mensagem)
    ("resgate",  "resgate_atipico",  "Resgate"),
    ("captacao", "captacao_atipica", "Captação"),
]

def reais_mi(valor):  # 12345678 -> "12,3"
    return f"{valor / 1e6:,.1f}".replace(",", "X").replace(".", ",").replace("X", ".")

def um_por_dia(informes):
    # Se o fundo manda uma linha "geral" (subclasse vazia), usamos ela.
    # Se so manda linhas por subclasse, somamos as subclasses.
    df = informes.copy()
    df["geral"] = df["subclasse"] == ""
    tem_geral = df.groupby(["cnpj", "data"])["geral"].transform("any")
    df = df[df["geral"] | ~tem_geral]
    soma = df.groupby(["cnpj", "data"], as_index=False)[["patrimonio", "captacao", "resgate"]].sum(min_count=1)
    return soma.sort_values(["cnpj", "data"]).reset_index(drop=True)

def achar_sangrias(df):
    # df: uma linha por fundo por dia, ja ordenada, com a coluna pl_ontem
    d = df.copy()
    d["liquido"] = d["captacao"].fillna(0) - d["resgate"].fillna(0)
    d["saindo"] = d["liquido"] < 0
    # cada sequencia de dias "saindo" ganha um numero: o contador sobe toda vez que aparece um dia sem saida
    d["sequencia"] = (~d["saindo"]).groupby(d["cnpj"]).cumsum()
    seq = d[d["saindo"]].groupby(["cnpj", "sequencia"]).agg(
        dias=("data", "count"), inicio=("data", "first"), data=("data", "last"),
        total=("liquido", "sum"), pl_antes=("pl_ontem", "first")).reset_index()
    seq["valor"] = -seq["total"]
    seq = seq[(seq["dias"] >= SANGRIA_DIAS) & (seq["valor"] >= SANGRIA_VALOR)
              & (seq["pl_antes"] >= MIN_PL) & (seq["valor"] >= SANGRIA_PCT_PL * seq["pl_antes"])].copy()
    if seq.empty:
        return seq.assign(tipo="sangria", mensagem="")
    dia = lambda t: f"{t[8:10]}/{t[5:7]}"
    seq["tipo"] = "sangria"
    seq["mensagem"] = seq.apply(lambda l: (
        f"Saída contínua: {l['dias']} dias seguidos saindo mais do que entra, de {dia(l['inicio'])} a {dia(l['data'])}, "
        f"somando R$ {reais_mi(l['valor'])} mi ({str(round(100 * l['valor'] / l['pl_antes'], 1)).replace('.', ',')}% do patrimônio)"), axis=1)
    return seq

def gerar_alertas(informes, fundos):
    df = um_por_dia(informes)
    por_fundo = df.groupby("cnpj")
    df["pl_ontem"] = por_fundo["patrimonio"].shift(1)

    achados = []
    for coluna, tipo, palavra in TIPOS:
        # o "normal" de cada fundo: media e oscilacao dos dias ANTERIORES (nunca o proprio dia)
        anteriores = por_fundo[coluna].shift(1)
        rolando = anteriores.groupby(df["cnpj"]).rolling(JANELA, min_periods=MIN_HISTORICO)
        media = rolando.mean().reset_index(level=0, drop=True).sort_index()
        oscilacao = rolando.std().reset_index(level=0, drop=True).sort_index().fillna(0)

        valor = df[coluna]
        febre = (
            media.notna()
            & (valor > media + DESVIOS * oscilacao)
            & (valor >= MIN_VALOR)
            & (valor >= MIN_PCT_PL * df["pl_ontem"])
            & (df["pl_ontem"] >= MIN_PL)
            & ((media == 0) | (valor >= VEZES_MEDIA * media))
        )
        sel = df[febre].copy()
        sel["media"] = media[febre]
        sel["valor"] = valor[febre]
        sel["tipo"] = tipo
        sel["palavra"] = palavra
        achados.append(sel)

    colunas = ["cnpj", "data", "tipo", "grupo", "nome", "mensagem", "valor"]
    sangrias = achar_sangrias(df).merge(fundos[["cnpj", "grupo", "nome"]], on="cnpj", how="left")
    al = pd.concat(achados)
    if al.empty and sangrias.empty:
        print("Alertas: nenhum encontrado")
        return pd.DataFrame(columns=colunas)

    al = al.merge(fundos[["cnpj", "grupo", "nome"]], on="cnpj", how="left")

    def escrever(l):
        dia = f"{l['data'][8:10]}/{l['data'][5:7]}"
        pct = 100 * l["valor"] / l["pl_ontem"]
        if l["media"] > 0:
            comparacao = f"{l['valor'] / l['media']:.0f}x a média do último mês"
        else:
            comparacao = "sem movimentos parecidos no último mês"
        pct_txt = f"{pct:.1f}".replace(".", ",")
        return f"{l['palavra']} de R$ {reais_mi(l['valor'])} mi em {dia} ({pct_txt}% do patrimônio; {comparacao})"

    al["mensagem"] = al.apply(escrever, axis=1) if len(al) else None
    al = pd.concat([al[colunas], sangrias[colunas]], ignore_index=True)
    print(f"Saidas continuas (sangrias): {len(sangrias)}")

    # Resumo na tela (pra gente conferir se a regra esta boa)
    print(f"Alertas encontrados: {len(al)} (media de {len(al) / al['data'].nunique():.1f} por dia)")
    print(al.groupby(["grupo", "tipo"]).size().unstack(fill_value=0).to_string())
    print("\nOs 5 maiores resgates fora do normal:")
    top = al[al["tipo"] == "resgate_atipico"].nlargest(5, "valor")
    for _, l in top.iterrows():
        print(f"  [{l['grupo']}] {str(l['nome'])[:45]}: {l['mensagem']}")
    return al
