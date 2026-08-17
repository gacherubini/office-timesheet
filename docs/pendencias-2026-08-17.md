# Pendências em aberto — 2026-08-17

Levantadas durante o dia do go-live. Nada aqui bloqueia o sistema de funcionar;
tudo aqui já foi verificado no código, não é suposição.

O que **foi** fechado hoje: vazamento de horas do time para colaborador, tela
branca ao aprovar proposta, seed de múltiplos admins, datas escorregando um dia,
data do bônus assumida pelo assistente, ErrorBoundary, card de proposta
contraditório, e o reset de senha (Resend verificado + secrets).

---

## 1. Cinco dúvidas de regra do assistente

Todas verificadas no código em 2026-08-17. O fio comum: **cada uma tem paridade
exata com uma tela que o colaborador já acessa**. Mudar o assistente sem mudar a
tela deixa o produto incoerente e não protege nada.

### 1.1 Colaborador vê férias de todo mundo — *recomendo manter*

`tools/read/feriasEConflitos.js` devolve `pessoa`, `inicio`, `fim`, `dias` de
todas as férias do período, mais lista de conflitos par a par (`pessoa_a`,
`pessoa_b`). `roles` inclui `employee`.

Paridade: `GET /vacation-calendar` (`routes/vacations.js:59`) é `requireAuth` —
qualquer pessoa logada. Calendário compartilhado é o objetivo do recurso.

Ressalva menor: a lista de conflitos é uma inferência que a tela talvez não
apresente tão mastigada.

### 1.2 Colaborador vê tarefas travadas do estúdio inteiro — *recomendo manter*

`tools/read/tasksTravadas.js` devolve `tarefa_id, projeto_id, titulo, projeto,
status, dias_parada`. **Sem nome de responsável** (confirmado no SELECT). Inclui
projetos em que a pessoa não atua. Espelha `GET /tasks`.

Sem responsável, é informação de fluxo, não sobre pessoas.

### 1.3 Colaborador vê andamento de qualquer projeto — *recomendo manter*

`tools/read/andamentoDeProjeto.js` devolve **só contagens** (comentários, anexos,
atividades) e títulos das últimas tarefas mexidas. Nenhum nome de pessoa.

### 1.4 O prompt do colaborador mente sobre financeiro — ⚠️ *recomendo corrigir*

`context/dominio/employee.md` afirma em duas linhas (5 e 13) que "não há
informação financeira disponível para você". Mas
`tools/read/simulacaoPerformance.js:75-77` devolve `meta_ganho`, `valor_hora` e
`valor_realizado` — **dado da própria pessoa**, com paridade em
`GET /me/simulation`.

Não é vazamento. É **fato errado no prompt**, e não decisão de política. O efeito
prático é o assistente recusar pergunta legítima ("quanto eu já ganhei este
mês?") sobre dado que a pessoa já vê na tela de performance.

Correção: distinguir "seu próprio ganho, sim" de "custo e salário dos outros,
não".

### 1.5 Colaborador atribui tarefa a outra pessoa — *duas perguntas, não uma*

`tools/write/proporEditarTask.js:107` aceita `employee`, e o campo `responsavel`
resolve por nome via `resolverPessoa`.

**(a) Produto:** colaborador deve poder reatribuir tarefa? Em estúdio pequeno,
provavelmente sim.

**(b) Inconsistência de gate:** com nome ambíguo, `tools/pessoas.js:18-20` lança
`Há mais de uma pessoa com esse nome ("Ana Silva", "Ana Costa"); especifique
melhor.` — ou seja, **a mensagem de erro devolve nomes**. E `listar_equipe` é
`admin` + `administrative_intern`: o assistente deliberadamente não dá a lista do
time ao colaborador. Existe um caminho que contorna esse gate, chutando nomes.

Não é grave (nomes não são segredo num estúdio pequeno, e o board provavelmente
já mostra responsável), mas é porta fechada na frente e encostada atrás. Decidir:
se colaborador pode ver a lista do time, abrir o `listar_equipe` e a
inconsistência some; se não pode, a mensagem de ambiguidade precisa parar de
citar nomes.

---

## 2. ESLint no `web/`

**Não existe ESLint no frontend** — nem config, nem script no `package.json`.

Foi o que deixou `Check` (usado em `AssistentePage.jsx`, nunca importado) chegar
em produção e virar tela branca: `no-undef` teria pego. O CI roda `npm run
check`, que é `node --check` (só sintaxe) e `vite build`, que não reclama de
variável livre — variável livre é JS válido.

O ErrorBoundary (`8094fa2`) trata o sintoma; o ESLint trataria a causa.
Provavelmente acusa violações pré-existentes, então vira um diff maior — motivo
de ter ficado por último.

## 3. `AGENT_API_KEY` não existe nos secrets do GitHub

O workflow `Evals do agente` falha em toda execução agendada com
`secret AGENT_API_KEY não configurado — os evals não têm como falar com o
provedor`. Ele aborta de propósito em vez de fingir que passou.

Consequência: **os evals do agente nunca rodaram**. O guardrail existe e está
inerte — inclusive para as mudanças de prompt feitas hoje (`core.md`,
`employee.md`, `admin.md`).

## 4. `VacationsPage.todayValue()` usa o fuso do navegador

Sobrou da correção de datas (`c206d08`). Usa `getFullYear/getMonth/getDate` do
browser, o que dá o dia **local de quem abre a tela** — certo para quem está no
Brasil, divergente para quem acessar de outro fuso. Não é o bug de UTC que foi
corrigido. Unificar em `todayInSaoPaulo()` se a data do estúdio tiver de valer
independentemente de onde a pessoa abre.

## 5. Flake de timing na suíte de integração

Race latente do harness, ~10-15% das execuções do suite completo, num teste de
integração aleatório. Sintoma sempre igual: linha recém-criada por uma request
não é encontrada pela seguinte. **Não é bug de produção** (roda 1 instância, sem
esse padrão). Confirmação: rodar isolado o arquivo que falhou.

Ataque de verdade, se for o caso: isolamento transacional por teste, ou
investigar reuso de conexão do pool `pg` com estado sujo.

## 6. Faxina de infra

- Destruir o cluster Postgres antigo em `gru` (a migração para `iad` está
  concluída).
- Hardening do `DATABASE_URL`.
- `db/fly.toml` desatualizado.
- Branch `backup-postgres` não mergeada; infra de backup automatizado pendente.
- Objetos antigos no bucket Tigris (avatares/recibos de teste) continuam lá
  depois do wipe — o wipe some com a linha no banco, não com o objeto.

## 7. Documentos soltos, nunca commitados

`docs/go-live-producao.md`, `docs/design-mockup.html`,
`docs/design-antes-depois.html`, `docs/design-review.html` estão como untracked
no repo. Decidir se entram no versionamento ou saem.
