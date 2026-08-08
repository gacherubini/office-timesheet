# Verificação visual — redesenho brand book Studio Vivian

Branch `feat/brand-book-studio-vivian`, 30 commits. Build e testes automáticos passam,
mas **nenhuma tela foi olhada** — o trabalho foi feito por agentes sem navegador. Este
roteiro é o que falta.

```bash
cd web && npm run dev
```

Teste com os **três papéis**, porque a navegação muda em cada um:

| Papel | "Início" leva a | Vê Performance? | Menu de Performance abre? |
|---|---|---|---|
| Admin | `/admin/dashboard` | sim | sim, com 4 sub-itens |
| Colaborador | `/dashboard` | sim | não, é link direto |
| Estagiário administrativo | `/admin/approvals` | **não** | — |

---

## 1. Mudanças de comportamento

Estas telas passaram a **funcionar** diferente, não só a parecer. Confira antes de
assustar com o resultado.

**`/admin/dashboard` — "Horas da equipe" vai despencar.** Antes o intervalo era fixo em
2000–2099, então o número era o acumulado histórico desde sempre. Agora o padrão é o mês
corrente. Um número muito menor é o comportamento certo. Troque entre Semana / Mês /
Trimestre e confirme que os três KPIs mudam juntos.

**`/admin/manage-bonuses` — o botão "Filtrar" sumiu.** Os filtros agora recarregam
sozinhos ao mudar. Confirme que a lista responde sem precisar submeter.

**`/admin/approvals`, `/expenses`, `/vacations` — formulários viraram modal.** Onde havia
um card de criação fixo na lateral, agora há um botão que abre modal. Confirme que criar,
validar e salvar continuam funcionando nos três.

---

## 2. Verificações transversais

Valem em qualquer tela:

- **Topbar** presente e fixa no topo ao rolar. Assinatura Studio Vivian branca sobre o
  verde — se estiver preta sobre verde, o filtro de inversão falhou.
- **A linha do grafismo** atravessa a topbar na diagonal, discreta. Se não aparecer, o
  `BrandLine` não está renderizando.
- **Sino e avatar** no canto direito. Sino abre o painel de notificações; avatar abre
  Perfil e Sair. Sem eles, não há como sair do sistema.
- **Em 375px de largura:** a assinatura vira só o símbolo e o menu abre em gaveta.
- **Nada arredondado** no fluxo da página — cards, botões, campos e chips são retos.
  Continuam redondos: avatar, ponto de status, ponto "ao vivo", spinner.
- **Sombra só em coisa que flutua** — modal, toast, dropdown, popover. Card na página não
  tem sombra.

---

## 3. Riscos conhecidos — comece por aqui

Ordenados por chance de estar errado.

**3.1 — Fundo com opacidade que não renderiza.** Este projeto tem dois bugs de Tailwind já
corrigidos, ambos silenciosos: opacidade sobre cor em `var()` não gerava CSS nenhum, e o
elemento ficava **sem fundo**. Foram 72 ocorrências, corrigidas na raiz. Onde olhar:
eventos da Agenda, eventos do calendário de férias, colunas do Kanban, realce de arraste,
chips de anexo. **Se algum desses estiver transparente ou sem cor, o bug voltou.**

**3.2 — Cor de evento nos dois calendários.** `/agenda` e `/vacation-calendar` mostram os
mesmos conceitos e precisam concordar:

- Férias aprovadas → **verde**
- Férias pendentes → **laranja**
- Feriado → **marrom**
- Compromisso do Google (pessoal ou escritório) → **neutro cinza**, distinguido por ícone

Se feriado aparecer laranja numa tela e marrom na outra, a correção não pegou. Confirme
também que numa grade cheia dá para separar os três de relance.

**3.3 — Simetria de botões no `/timer`.** "Play", "Pausar" e "Encerrar" devem ter o mesmo
peso visual: os três sólidos, em verde, marrom e vermelho-tijolo. Se "Pausar" parecer mais
fraco que os irmãos, a correção não pegou.

**3.4 — Altura dos filtros.** As faixas de controle de `/tarefas`, `/pessoas`,
`/admin/time-entries`, `/admin/reports`, `/history` e `/admin/manage-expenses` devem ter
busca, selects, datas e botão **todos na mesma altura**. Três telas tinham alturas
diferentes antes da correção.

**3.5 — Tabelas largas em 1280px.** `/admin/time-entries` tem 12 colunas e
`/admin/reports` tem 7 abas mais período mais botão na mesma linha. Confirme que nada
quebra nem some.

---

## 4. Por tela

### `/admin/dashboard` — home do admin
- Título "Visão geral da **operação**", com "operação" em serifa itálica.
- Bloco herói marrom com a linha do grafismo atravessando; "Horas da equipe" em número
  grande e branco, com "Usuários ativos" e "Projetos ativos" menores no mesmo campo.
- Faixa "Ao vivo" branca e horizontal, com ponto laranja e avatares de quem está com o
  ponto rodando.
- Coluna direita: **uma** fila "Precisa de você" — não três cards. Cada item tem etiqueta
  de tipo em marrom (Horas / Despesa / Férias), contador laranja no topo.
- **Aprovar e rejeitar de cada tipo:** aprove uma solicitação de hora, uma despesa e uma
  férias. Cada uma deve sumir da fila e o contador acompanhar. *Este é o teste mais
  importante da tela* — a fusão das três filas é onde um item poderia acabar chamando a
  função do tipo errado.

### `/dashboard` — home do colaborador
- Título "Olá, **Nome**" com o nome em serifa itálica; o ponto decorativo antigo sumiu.
- Bloco herói marrom com a linha, "Horas no mês" e "Projetos".
- Barras de proporção por projeto em **marrom**, retas.

### `/login`, `/forgot-password`, `/reset-password`
- Assinatura oficial nas quatro aparições (painel verde, bloco mobile, e as duas telas de
  senha). O `Logo.jsx` improvisado foi apagado — se aparecer um quadrado com círculo e
  risco desenhado, algo ficou para trás.
- Painel esquerdo verde com **uma** linha diagonal. Sem borrão laranja, sem segunda linha.
- "vazio fértil" no laranja da marca.
- Nada em fonte monoespaçada.
- **Em 375px:** o bloco mobile ficou sem o fio separador que o painel verde tem — ponto
  em aberto, confira se incomoda.

### `/pessoas`
- Faixa única: busca, chips de categoria com contador, "Nova pessoa" à direita.
- Tabela com cabeçalho de coluna em caixa alta espaçada sobre cinza.
- **Ponto em aberto:** o aviso "Os apontamentos serão preservados" era azul (informativo) e
  virou verde (sucesso). Confira se a leitura faz sentido ou se devia ser neutro.
- Em ~900px a faixa quebra em duas linhas sem sobrepor.

### `/tarefas` e `/projetos` — o quadro
- **O Kanban não mudou de forma.** Quatro colunas, cartão arrastável, faixa "Abandonados"
  recolhível embaixo. Se a estrutura mudou, algo saiu errado.
- **Arraste um cartão** entre as quatro colunas e para "Abandonados". O realce de destino
  aparece, o status persiste ao recarregar.
- Status como progressão: **A fazer** contorno vazio → **Fazendo** laranja → **Em revisão**
  marrom → **Concluído** verde.
- Prioridade idem: **Baixa** contorno → **Média** laranja → **Alta** vermelho-tijolo.
- Cronômetro no cartão: iniciar e parar. Verde correndo, vermelho-tijolo para parar.
- Alterne Lista / Board.

### `/agenda`
- Ver risco 3.2. Os toggles de camada agora são caixa de seleção **sem cor** — a cor está
  reservada para o tipo do evento.
- Ligar e desligar cada camada some e volta com os eventos certos.
- Grade de semana e de mês inalteradas.

### `/performance`
- Nada laranja. O simulador inteiro passou para marrom: chip "Salvo", checkbox de fim de
  semana, células editáveis, legenda, total projetado.
- Compare com o bloco herói de `/admin/dashboard` — é o mesmo marrom.
- A barra "Outros" ficou cinza neutro (é agregado, não projeção).

### `/admin/approvals`
- As três filas continuam **separadas por seção** — aqui a separação é o assunto da página.
- **Avatares presentes** em cada item. Se sumiram, a correção não pegou.
- Aprove e rejeite um item de cada seção.

### `/admin/live`
- Ponto de estado: rodando verde, pausado laranja, offline cinza.

### `/admin/time-entries`, `/admin/reports`, `/history`
- Ver risco 3.5. As três usam a largura toda — se aparecerem estreitas e centralizadas,
  alguém introduziu largura máxima indevida.
- Troque o período e confirme que os totais batem com o que batiam antes.

### `/expenses`, `/vacations`, `/admin/manage-bonuses`
- Ver mudanças de comportamento na seção 1.
- Chips de status de solicitação: aprovado verde, pendente laranja, rejeitado
  vermelho-tijolo.

### `/admin/deleted-users`, `/admin/deleted-projects`
- Botão "Restaurar" é secundário neutro com borda — nunca vermelho, restaurar não é
  destrutivo.
- Restaure um usuário e um projeto; ambos voltam às listas de origem.

### `/profile`
- Duas seções de formulário, largura contida.
- Salve uma alteração de dados e troque a senha; as faixas de retorno aparecem.
- O visualizador de foto ampliada mantém sombra — é overlay.

### `/vacation-calendar`
- Ver risco 3.2.
- **Nota:** a API só devolve férias aprovadas hoje, então o ramo laranja (pendentes) não é
  exercitável sem mexer no backend. O código está pronto.

---

## 5. Pendências conhecidas

Não bloqueiam, mas estão registradas:

- **SVG da marca.** O brand book manda usar SVG na web; só temos PNG. Pedir os vetoriais a
  `contato@johnandhackmann.com`. E conferir o arquivo da versão branca — ele tem o mesmo
  tamanho em bytes do preto, o que sugere que estão trocados na origem. Hoje a versão
  branca é obtida invertendo a preta por CSS.
- **"Gestão VOID" contradiz a página 31 do livro**, que diz que o símbolo "não simboliza
  ausência, mas sim potencial". Decisão consciente de manter.
- `NotificationBell.jsx` — o ícone tem `group-hover:rotate` mas o botão pai perdeu a classe
  `group`. Micro-interação morta, inofensiva.
- `EmployeeDashboardPage.jsx` — passa `icon=` para um componente que não renderiza mais
  ícone. Prop vestigial.
- "Em revisão = marrom" está codificado em dois lugares (`helpers.js` e `StatusChip.jsx`).
  Considerar fonte única.
- A fila "Precisa de você" tem ordem fixa (Horas, Despesa, Férias) por concatenação. Sem
  ordenação por data ou urgência.
