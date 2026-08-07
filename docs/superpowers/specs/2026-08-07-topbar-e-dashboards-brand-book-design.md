# Topbar e dashboards sobre o brand book Studio Vivian

Data: 2026-08-07
Direção aprovada: **B · Dois campos**

## Objetivo

Trocar a sidebar por uma topbar, adotar a assinatura oficial da marca e redesenhar
as duas home pages seguindo o brand book Studio Vivian v1.0 (nov/2025), que até
agora foi seguido só em parte.

## Diagnóstico

A paleta do `web/src/index.css` já vem do livro: `#615142`, `#2E3D38`, `#4C665E`,
`#CB6D31`, `#ECECEC` e `#2C2216` são exatamente a página 37. As fontes também
estão certas — `@fontsource-variable/funnel-sans` e `@fontsource/instrument-serif`
são importadas em `web/src/main.jsx:6-8`.

O que não está seguido é o **uso**:

1. **O marrom `#615142` é cor principal e está inerte.** A página 38 põe marrom e
   verde em pé de igualdade. No app ele é `--color-accent-3` e quase não aparece.
2. **O grafismo está invisível.** `Layout.jsx:266-279` desenha o brilho laranja e
   duas diagonais atrás do conteúdo — mas os cards são brancos e opacos, então
   nada disso chega à tela. A página 47 usa a linha sempre sobre campo de cor
   sólida, nunca sobre branco.
3. **Tokens inventados.** `--color-text: #2C2216` é o marrom escuro da paleta
   usado como texto; a página 38 reserva o preto `#0F0F0F` para texto. E
   `--color-surface-alt: #E3E8E5`, `--color-text-sec: #5F6E66`,
   `--color-border: #DEE3DF` e os `--color-field-*` são verdes acinzentados que
   não existem no livro.
4. **Pesos fora da escala.** O livro define Light, Regular e Medium (04.1). O
   código usa `font-semibold` e `font-bold` largamente.
5. **A hierarquia tipográfica não é usada.** 04.3 manda título em Funnel Light
   combinado com Instrument Serif itálico. Hoje o serif aparece só num ponto
   final decorativo (`EmployeeDashboardPage.jsx:103`).

## Sistema de tokens

Reescrever o `:root` do `web/src/index.css`. Nomes passam a dizer o que a cor é,
não onde ela era usada.

```
--color-ink:       #0F0F0F   /* texto — p.38 */
--color-green-dk:  #2E3D38   /* principal */
--color-green:     #4C665E   /* principal, claro */
--color-brown:     #615142   /* principal */
--color-brown-dk:  #2C2216
--color-orange:    #CB6D31   /* só grafismo e sinal pontual */
--color-bg:        #ECECEC
--color-surface:   #FFFFFF
```

Derivados de preto com alfa, no lugar dos verdes inventados:

```
--color-text-sec:  rgba(15,15,15,.55)
--color-border:    rgba(15,15,15,.10)
--color-hover:     rgba(15,15,15,.04)
```

`--color-sidebar` e `--color-accent-3` saem. `--color-accent` vira alias de
`--color-green` para não quebrar as páginas fora de escopo.

### Regra do laranja

`#CB6D31` fica restrito ao grafismo e a sinais pontuais — o ponto de "ao vivo" e
o contador de pendências. **Não é cor de botão, de link nem de barra de dados.**
A página 38 diz: complemento sutil, reservado a pequenos detalhes, sem competir
com a paleta principal.

### Tipografia

| Papel | Tratamento |
|---|---|
| Título de página | Funnel Light 300 + Instrument Serif itálico na mesma frase |
| Números grandes | Funnel Light 300, tabular |
| Rótulos | Funnel Regular 400, caixa alta, tracking .2em, 9–10px |
| Ênfase | Funnel Medium 500 |

Teto de peso: **500**. Nenhum `font-semibold` ou `font-bold` nos arquivos em
escopo.

### Regra do grafismo

A linha contínua só existe **sobre campo de cor sólida**: a topbar verde e o
bloco herói marrom. Uma linha por campo, 1px, branco a 30%, `vector-effect="non-scaling-stroke"`.
O bloco decorativo de `Layout.jsx:266-279` é removido.

## Topbar

Substitui o `<aside>` do `web/src/components/Layout.jsx`.

- Altura 56px, largura total, fundo `--color-green-dk`, com a linha atravessando.
- Fixa no topo (`sticky`) — a sidebar de hoje é `md:sticky md:top-0` e a navegação
  não pode sumir no scroll de páginas longas como a de apontamentos.
- **Esquerda:** assinatura horizontal em branco + fio vertical + "Gestão VOID" em
  Funnel Light. O livro exige folga de metade da altura da assinatura em volta
  (02.1); a 14px de altura, são 7px mínimos.
- **Centro:** Início, Tarefas, Projetos, Pessoas, Agenda, Performance. Ativo em
  branco com fio de 1px embaixo; inativo em branco 60%.
- **Performance** vira menu suspenso para admin, com Relatórios, Apontamentos,
  Bônus e Despesas — hoje são `children` aninhados na sidebar.
- **Direita:** `NotificationBell`, que sai de dentro do `<main>`
  (`Layout.jsx:281`) e ganha lugar fixo, mais o avatar com menu de Perfil e Sair.
- **Mobile:** a assinatura vira o símbolo isolado (redução mínima 16px, p.33) e a
  navegação vira gaveta por botão. O scroll horizontal atual sai.

Saem: `isSidebarPinned`, `isSidebarHovered`, a chave `sidebarPinned` do
localStorage, e os componentes `NavRow` e `NavSubRow`.

## Dashboard admin

`web/src/pages/admin/AdminDashboardPage.jsx`.

- **Título:** "Visão geral da *operação*", com "operação" em Instrument Serif
  itálico. Ao lado, seletor de período: Semana, Mês, Trimestre.
- **Correção de produto:** `FULL_RANGE_START`/`FULL_RANGE_END`
  (`AdminDashboardPage.jsx:14-15`) fixam o intervalo em 2000–2099, então "Horas
  da equipe" é um acumulado histórico, não um retrato do período. O padrão passa
  a ser o mês corrente. **Isso muda o número que a direção lê hoje** e precisa de
  aviso antes de subir.
- **Bloco herói** em `--color-brown`, largura total, com a linha: "Horas da
  equipe" em Funnel Light grande e a comparação com o período anterior; à
  direita, no mesmo campo, Usuários ativos e Projetos ativos em corpo menor.
- **Faixa "Ao vivo"** branca e horizontal — ponto laranja, avatares, nome e
  tarefa, link para o painel completo. Substitui o `LiveNowCard` empilhado.
- **Coluna esquerda:** "Horas por pessoa", abas Equipe/Projetos preservadas
  (`Tabs`), cada linha com barra de proporção em marrom.
- **Coluna direita — "Precisa de você":** fila única fundindo Solicitações,
  Despesas e Férias, que hoje são três cards de estrutura idêntica. Cada item
  ganha etiqueta de tipo em marrom. O contador em laranja. As três chamadas de
  API e as seis funções de aprovar e rejeitar continuam como estão; muda só a
  apresentação.
- `BirthdayCalendar` segue na coluna direita.
- **Botões:** Aprovar em `--color-green-dk` sólido; Rejeitar fantasma com borda
  preta a 22%.

## Dashboard do colaborador

`web/src/pages/EmployeeDashboardPage.jsx`.

- **Título:** "Olá, *Vivian*", com o nome em Instrument Serif itálico. Substitui o
  ponto final decorativo de hoje.
- **Bloco herói** marrom com "Horas no mês" e "Projetos", igual ao do admin.
- **Registro de horas por projeto:** a barra de proporção passa de verde para
  marrom.
- `MyTasksTimer`, "Projetos", `AgendaCard` e `BirthdayCalendar` mantidos, com a
  tipografia e os pesos novos.

## Cor de estado

O brand book governa identidade, não semântica de estado. O app usa hoje **345
classes de cor do Tailwind fora da paleta** — rose (164), emerald (93), amber
(31), sky e violet (36) — sem token nenhum. Some com varredura só o que não
carrega significado; vermelho quer dizer erro antes de qualquer leitura.

A política adotada estende a paleta com **dois tokens funcionais**, afinados para
o registro sóbrio que a página 36 pede:

```
--state-danger:  #9E4034   /* erro, ação destrutiva, parar cronômetro */
--state-success: #3E7355   /* sucesso, cronômetro em curso, online */
```

"Atenção" não ganha cor nova: reaproveita `--color-orange`, que já marca o ponto
de "ao vivo" e o contador de pendências.

**Categoria não usa os tokens funcionais — usa a marca.** As três camadas da
Agenda viram verde, marrom e laranja. Os quatro status de tarefa e as três
prioridades são **sequências**, não categorias, e viram progressão:

| Status | Cor | Prioridade | Cor |
|---|---|---|---|
| A fazer | contorno `rgba(15,15,15,.35)` | Baixa | contorno |
| Fazendo | `--color-orange` | Média | `--color-orange` |
| Em revisão | `--color-brown` | Alta | `--state-danger` |
| Concluído | `--state-success` | | |

## Padrão das telas de lista

Pessoas, Tarefas e Agenda inventam hoje três controles diferentes para a mesma
ideia. Passam a compartilhar:

- **Faixa de controle** — uma linha sob o título, sempre na mesma ordem: busca,
  filtros, alternador de visão, ação primária à direita. Substitui o `TabChip`
  com `tone` de Pessoas, o par de ícones em caixa de Tarefas e o par de pílulas
  da Agenda.
- **Superfície de dados** — branca com fio de 1px, cabeçalho de coluna em caixa
  alta espaçada sobre `#ECECEC`.

**O Kanban não muda de forma.** Grade de quatro colunas, cartão arrastável,
prioridade, responsável, cronômetro no cartão e faixa recolhível de Abandonados
ficam exatamente como estão. Trocam-se apenas as cores. O mesmo vale para a visão
de Lista da mesma página.

## Fora de escopo

- As demais páginas herdam a topbar e os tokens, mas mantêm pesos 600/700 e a
  estrutura de card atual. Dívida declarada para a rodada seguinte.
- **SVG da marca.** O livro manda usar SVG na web (p.89) e só temos PNG. Pedir os
  arquivos vetoriais a `contato@johnandhackmann.com`. Até lá, PNG — e checar o
  arquivo da versão branca: "ASSINATURA PRINCIPAL HOR - BRANCO" e a versão preta
  têm o mesmo tamanho em bytes, o que sugere que um dos dois está trocado. Nos
  mockups a versão branca foi obtida invertendo a preta.
- Remover `inter`, `space-grotesk` e `ibm-plex-mono` do `web/package.json` — estão
  instalados e ninguém importa.

## Decisões assumidas

- **"Gestão VOID" fica.** A página 31 diz que o símbolo "não simboliza ausência,
  mas sim potencial", o que contradiz o nome. A contradição foi apontada e o
  cliente optou por manter.
- Trocar `--color-text` para `#0F0F0F` altera o app inteiro de uma vez, incluindo
  as páginas fora de escopo. É o comportamento desejado: o preto é o token certo.
