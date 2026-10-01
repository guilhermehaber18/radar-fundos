# ⚽ Meu 365

Site de futebol inspirado no app 365Scores, criado do zero como projeto de aprendizado.

🔗 **Acesse:** [meu-365.vercel.app](https://meu-365.vercel.app)

## O que o site faz

- 📅 **Jogos de hoje, da semana e do mês** do Brasileirão, Premier League e Champions League, com dados reais
- 📺 **Onde passa** cada jogo, com regra automática por campeonato e ajuste manual
- ⭐ **Times favoritos**, salvos em banco de dados, com destaque nos jogos
- 📊 **Estatísticas**: classificação completa e números dos meus times (pontos, V-E-D, gols, saldo e aproveitamento)
- 🔄 Botão de atualizar e layout adaptado para celular

## Como funciona

O site (a "vitrine") nunca guarda senhas. Ele pede tudo a pequenos "atendentes" na Vercel, que guardam as chaves num cofre:

```
Site (HTML, CSS, JavaScript)
   │
   ├── /api/jogos ──────────► Football-Data API (jogos)
   ├── /api/classificacao ──► Football-Data API (tabelas)
   ├── /api/favoritos ──────► Supabase (banco de dados)
   └── /api/transmissoes ───► Supabase (banco de dados)
```

## Ferramentas usadas

| Ferramenta | Para quê |
|---|---|
| HTML, CSS e JavaScript | Estrutura, visual e interatividade do site |
| GitHub | Guardar o código e o histórico de versões |
| Vercel | Publicar o site e rodar as funções (atendentes) |
| Supabase | Banco de dados dos favoritos e transmissões |
| Football-Data.org | API com jogos e classificações |

## O que aprendi

- Usar **Git** (add, commit, push) e publicar automaticamente com a **Vercel**
- Consumir **APIs** com token e ler respostas em **JSON**
- Proteger chaves em **variáveis de ambiente** (o "cofre")
- Criar tabelas e ler/escrever dados no **Supabase** (GET, POST, DELETE)
- Converter fusos horários, usar cache e tratar erros com `try/catch`
- Investigar problemas com o **Console do navegador (F12)**

## Próximos passos

- [ ] Login de usuários (cada pessoa com seus favoritos)
- [ ] Mais campeonatos (La Liga, Serie A, Bundesliga...)
- [ ] Agente de IA para preencher automaticamente onde passa cada jogo do Brasileirão

---

Feito por **Guilherme Haber** · Administração na FGV EAESP
