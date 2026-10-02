# =============================================================
# Resumo diario por e-mail do Radar de Fundos
# Monta um e-mail com os alertas NOVOS e envia pelo Gmail.
# As chaves vem do cofre: EMAIL_REMETENTE, EMAIL_SENHA e EMAIL_DESTINO
# (a senha e uma "senha de app" do Google, nunca a senha normal da conta).
# =============================================================

import os, smtplib, html
from email.message import EmailMessage

SITE = "https://radar-fundos.vercel.app"
NOMES = {"BTG": "BTG", "Itau": "Itaú", "XP": "XP", "Bradesco": "Bradesco"}
ORDEM = ["BTG", "Itau", "XP", "Bradesco"]
TIPOS = {"resgate_atipico": "Saída fora do normal", "captacao_atipica": "Entrada fora do normal", "sangria": "Saída contínua"}
MAX_POR_GRUPO = 8      # para o e-mail nao ficar enorme

def dia(t):            # "2026-09-30" -> "30/09"
    return f"{t[8:10]}/{t[5:7]}"

def montar_email(novos, ultima_data):
    # novos: lista de dicionarios com cnpj, data, tipo, grupo, nome, mensagem, valor
    total = len(novos)
    do_btg = sum(1 for a in novos if a["grupo"] == "BTG")
    if total == 0:
        assunto = f"Radar de Fundos: nenhum alerta novo (dados até {dia(ultima_data)})"
    else:
        assunto = f"Radar de Fundos: {total} alerta{'s' if total != 1 else ''} novo{'s' if total != 1 else ''} ({do_btg} do BTG)"

    linhas_txt = [assunto, ""]
    partes = [f'<div style="font-family:Arial,sans-serif;font-size:15px;color:#16233B;max-width:640px">',
              f'<h2 style="margin:0 0 4px">Radar de Fundos</h2>',
              f'<p style="margin:0 0 16px;color:#5B6576">Dados da CVM até {dia(ultima_data)}. '
              f'{"Nenhum alerta novo desde a última coleta." if total == 0 else f"{total} alertas novos desde a última coleta."}</p>']

    for grupo in ORDEM:
        do_grupo = sorted([a for a in novos if a["grupo"] == grupo], key=lambda a: -float(a["valor"] or 0))
        if not do_grupo:
            continue
        partes.append(f'<h3 style="margin:20px 0 6px;border-bottom:1px solid #D9DEE7;padding-bottom:4px">{NOMES[grupo]} ({len(do_grupo)})</h3>')
        linhas_txt += [f"{NOMES[grupo]} ({len(do_grupo)})"]
        for a in do_grupo[:MAX_POR_GRUPO]:
            cor = "#0B7A55" if a["tipo"] == "captacao_atipica" else "#B3261E"
            seta = "↑" if a["tipo"] == "captacao_atipica" else "↓"
            partes.append(
                f'<p style="margin:10px 0"><span style="color:{cor};font-weight:bold">{seta} {TIPOS.get(a["tipo"], a["tipo"])}</span><br>'
                f'<a href="{SITE}/#fundo/{a["cnpj"]}" style="color:#16233B;font-weight:bold">{html.escape(str(a["nome"]))}</a><br>'
                f'<span style="color:#5B6576">{html.escape(str(a["mensagem"]))}</span></p>')
            linhas_txt += [f"  {seta} {a['nome']}: {a['mensagem']}"]
        if len(do_grupo) > MAX_POR_GRUPO:
            resto = len(do_grupo) - MAX_POR_GRUPO
            partes.append(f'<p style="margin:10px 0;color:#5B6576">E mais {resto}. Veja todos no site.</p>')
            linhas_txt += [f"  e mais {resto}"]
        linhas_txt += [""]

    partes.append(f'<p style="margin:24px 0 0"><a href="{SITE}" style="color:#2445A8;font-weight:bold">Abrir o Radar de Fundos</a></p>'
                  f'<p style="margin:12px 0 0;font-size:12px;color:#5B6576">Enviado automaticamente pelo robô do Radar de Fundos, com dados públicos da CVM. '
                  f'Não é recomendação de investimento.</p></div>')
    linhas_txt += [f"Abrir o site: {SITE}"]
    return assunto, "\n".join(partes), "\n".join(linhas_txt)

def enviar_email(assunto, corpo_html, corpo_texto):
    remetente = os.environ.get("EMAIL_REMETENTE")
    senha = os.environ.get("EMAIL_SENHA")
    destino = os.environ.get("EMAIL_DESTINO") or remetente
    if not remetente or not senha:
        print("  E-mail: chaves EMAIL_REMETENTE e EMAIL_SENHA nao configuradas, nada enviado")
        return False
    msg = EmailMessage()
    msg["Subject"] = assunto
    msg["From"] = f"Radar de Fundos <{remetente}>"
    msg["To"] = destino
    msg.set_content(corpo_texto)
    msg.add_alternative(corpo_html, subtype="html")
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as servidor:
        servidor.login(remetente, senha.replace(" ", ""))     # a senha de app vem com espacos: tiramos
        servidor.send_message(msg)
    print(f"  E-mail enviado: {assunto}")
    return True
