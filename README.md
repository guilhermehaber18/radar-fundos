# Radar de Fundos

Site que acompanha, todo dia, os fundos de investimento de **BTG, Itaú, XP e Bradesco** e avisa quando algum deles tem uma entrada ou saída de dinheiro fora do normal. Usa só dados públicos da CVM.

**Site:** https://radar-fundos.vercel.app

## O problema

Saber se os fundos de uma gestora estão ganhando ou perdendo dinheiro em relação aos concorrentes dá trabalho manual: a CVM publica um arquivo por mês com mais de 30 mil fundos, só com CNPJ, sem nome nem gestora.

## O que o Radar faz

| Tela | O que mostra |
|---|---|
| **Alertas** | Os movimentos fora do normal de cada dia, do maior para o menor |
| **Pesquisar fundo** | Busca por nome, gestora ou CNPJ |
| **Página do fundo** | Patrimônio, cota, entradas e saídas em gráficos, com os alertas marcados |
| **Comparar fundos** | Até 4 fundos partindo do mesmo ponto (base 100) |
| **BTG x rivais** | Entradas menos saídas de cada grupo |

## Como funciona

```
CVM (dados abertos)
   │  todo dia, 9h
   ▼
Robô em Python (GitHub Actions)  →  baixa, filtra os 4 grupos, calcula alertas e totais
   ▼
Supabase (banco de dados)
   ▼
Funções da Vercel (pasta api/)   →  só leem o que o site pede
   ▼
Site (HTML, CSS e JavaScript puro, gráficos em SVG)
```

O trabalho pesado fica no robô porque os arquivos da CVM são grandes demais para o limite de tempo das funções gratuitas da Vercel. O site nunca vê a chave do banco: ela fica nos cofres do GitHub e da Vercel.

## A regra dos alertas

Cada fundo é comparado com **ele mesmo**. Um dia vira alerta quando o resgate (ou a captação) passa nos quatro filtros:

1. Está acima da média do último mês do fundo mais 3 vezes a oscilação típica dele
2. É pelo menos 3 vezes essa média
3. É de pelo menos R$ 10 milhões e 3% do patrimônio
4. O fundo tem pelo menos R$ 50 milhões

A primeira versão gerava cerca de 55 alertas por dia, a maioria falso alarme (fundos de caixa que giram quase todo o patrimônio diariamente e fundos pequenos). Depois de calibrada, ficou em cerca de 23 por dia, uns 4 do BTG. A regra foi ajustada com 2 meses de dados e manteve o mesmo comportamento em 12 meses.

## O que os dados mostraram (out/2025 a set/2026)

- Entre os quatro grupos, o **BTG teve a maior captação líquida** (cerca de R$ 28,6 bi); o Itaú ficou negativo.
- BTG Tesouro Selic e Itaú Soberano **renderam o mesmo** (+14,2%), mas o patrimônio do primeiro cresceu 38,8% e o do segundo 9,5%: a diferença foi dinheiro novo, não desempenho.
- Um alerta de resgate isolado pode enganar: no BTG Tesouro Selic, em 12/03/2026, houve resgate e captação atípicos no mesmo dia e o patrimônio quase não mudou.

## Limitações

- **Só quatro grupos** (cerca de 4.400 fundos não exclusivos), para caber no plano gratuito do banco.
- **Não é tempo real:** os fundos entregam o informe com alguns dias de atraso. Os totais por grupo só incluem dias em que quase todos já entregaram.
- **Dupla contagem:** muitos fundos investem em outros fundos do mesmo grupo. Os totais por grupo servem para comparar tendências, não como número oficial de captação.
- O histórico guardado é de pouco mais de 1 ano.

## Com dados internos, o próximo passo seria

- Separar a captação por canal e por tipo de cliente
- Tirar a dupla contagem usando a carteira dos fundos
- Enviar os alertas por e-mail para quem cuida de cada fundo

## Arquivos

| Arquivo | Papel |
|---|---|
| `coletar.py` | Robô: baixa da CVM e grava no banco |
| `alertas.py` | A regra dos alertas |
| `.github/workflows/coletar.yml` | Agenda diária do robô |
| `api/` | Funções que o site chama (alertas, pesquisa, histórico, resumo) |
| `index.html`, `style.css`, `script.js`, `fundo.js`, `comparar.js` | O site |

Fonte dos dados: [Portal de Dados Abertos da CVM](https://dados.cvm.gov.br/dataset/fi-doc-inf_diario).

Feito por Guilherme Haber.
