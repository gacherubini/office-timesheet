# Visão Geral — Ajustes Gestão VOID (PDF de 18/08/2026)

**Data:** 2026-08-18
**Status:** documento mestre; os 4 specs irmãos detalham cada bloco
**Origem:** `Gestao-VOID-ajustes-desenvolvimento.pdf` — Studio Vivian,
solicitante João Pedro Vivian, 18/08/2026
**Brainstorming:** Claude Code, 2026-08-18

> O PDF traz **11 ajustes** levantados no uso da versão atual. Não cabem num
> spec só: somam quatro subsistemas com dependências entre si e três deles
> mudam o modelo de dados. Este documento decompõe, fixa as decisões já
> tomadas e diz o que ainda depende de resposta do cliente.

---

## 1. Os 11 itens em 4 blocos

| Bloco | Itens do PDF | Peso | O que toca |
|---|---|---|---|
| **A · Sistema e Interface** | 9, 10, 11 | leve | Favicon/manifest/título, "usuários online", chat flutuante. **Zero migration** |
| **B · Pessoas** | 1, 2, 3, 4, 5 | pesado | PF/PJ, contatos múltiplos, CEP, admissão, cargo ≠ permissão |
| **C · Projetos** | 7, 8 | pesado | N:N cliente-projeto, camada de etapas, catálogo, templates, "Falta info" |
| **D · Visibilidade** | 6 | médio | Restrição por campo e por anexo, no lugar do `admin_only` |

**Ordem de execução:** A → B → D, com C em paralelo a partir de B.
D **depende de B** — não dá para marcar visibilidade de campos que ainda não
existem (CNPJ, inscrição estadual, dados bancários nascem no bloco B).
A e C não dependem de nada.

```
A (interface)  ──────────────────────────►  independente

B (pessoas)  ──┬──►  D (visibilidade por campo)
               │
C (projetos) ──┘     (C só precisa de B para o vínculo N:N usar
                      o cadastro novo; a camada de etapas é independente)
```

---

## 2. Decisões travadas no brainstorming de 18/08/2026

| Tema | Decisão | Motivo |
|---|---|---|
| **Abrangência do bloco B** | Clientes **e** fornecedores. `users` fica de fora | Fornecedor PJ com e-mail financeiro é caso real. `users` é a tabela mais acoplada do sistema (auth, `userCache`, agente, relatórios) — mexer nela é o maior risco de regressão do projeto |
| **Modelo das tabelas filhas** | Um conjunto só, com `client_id` e `supplier_id` anuláveis + `CHECK (num_nonnulls(...) = 1)` | Mantém FK declarativa de verdade (nada de FK polimórfica frouxa), não duplica regra, e não mexe em `clients`, `suppliers` nem `projects.client_id` |
| **Dado de produção** | Existe. Toda migration tem backfill explícito | Nenhuma migration pode perder dado |
| **`tasks.task_type`** | Substituído por `stage_id`. Coluna removida ao fim do bloco C | O PDF exige "toda tarefa pertence a uma etapa". Dois campos com o mesmo significado confundem a tela e o agente |
| **Catálogo de etapas** | **Global e editável pelo admin**, semeado com as 10 do PDF + os `task_type` existentes | Global preserva a comparação de custo/prazo entre obras (alerta do próprio PDF). Editável destrava a implementação sem esperar o João Pedro |
| **"Usuários online"** | Map em memória + heartbeat de 60s | Custo zero no banco. Ver §3 |
| **Chat flutuante** | Estado extraído para um `AgentContext`; página e painel viram views da mesma conversa | Única forma de "a conversa continua de onde parou" valer entre os dois |
| **Dados bancários** | Criados em cliente e fornecedor, restritos por padrão | O PDF cita explicitamente; o campo não existia |
| **Log de acesso LGPD** | **Fora do escopo** — decisão de 18/08/2026 | Ver §4. Registrado aqui de propósito: é item pedido por escrito pelo cliente |

---

## 3. Por que "usuários online" não vira coluna no banco

`requireAuth` (`src/middleware/auth.js`) hoje faz **zero queries** em cache hit —
o `lib/userCache.js` existe exatamente para isso, e o comentário dele diz na
cara que serve para "evitar 1 SELECT por request autenticado".

| Opção | Custo por request | vs. baseline |
|---|---|---|
| Map em memória | um `Map.set`, ~100ns | ~0,2% do custo do JWT verify |
| `users.last_seen_at` | UPDATE: pool + round-trip + commit, ~0,5–2ms | **20–40× o requireAuth inteiro** |
| Tabela `user_sessions` | mesmo UPDATE, em tabela própria | igual, mais código e job de limpeza |

Em números absolutos 1,5ms num estúdio de 10 pessoas é irrelevante — **latência
não é o critério**. O que decide é **contenção**: `users` é a tabela que todo
request lê, e escrever nela pega lock de linha e gera bloat, para alimentar um
número na home. É remar contra a arquitetura que o `userCache` já montou.

Custo aceito do Map: zera no deploy e repopula em segundos. Ninguém audita
"quem estava online terça às 14h".

O **heartbeat** (`POST /me/heartbeat` a cada 60s, só com aba visível) resolve um
problema que as três opções compartilham: sem ele o sinal depende da tela em que
a pessoa está por acaso fazer polling, e quem lê a página de um projeto sumiria
do indicador em 5 minutos sentado na cadeira.

---

## 4. Definições pendentes com o João Pedro

O PDF tem uma seção "DEFINIÇÕES PENDENTES (comigo, não com o dev)". Nenhuma
delas bloqueia a implementação — cada spec adota um default e marca o que
precisa de confirmação.

| Pendência | Como o spec resolve | Precisa de resposta? |
|---|---|---|
| **Catálogo de etapas** | Cadastro global editável pelo admin, semeado com as 10 do PDF + os `task_type` de produção | Não bloqueia. Ele ajusta pela tela |
| **Campos sensíveis** | Nascem restritos: CPF, CNPJ, RG, dados bancários. Valores de contrato já são admin-only | Não bloqueia. Confirmar a lista |
| **Papéis de cliente no projeto** | Os 4 do PDF: contratante principal, contratante, investidor, representante | Confirmar |
| **Cargos** | Os 4 do PDF: arquiteto, estagiário, administrativo, sócio + texto livre | Confirmar |
| **Retenção do log de acesso** | **Não se aplica** — log fora do escopo | — |

### O log de acesso a dados sensíveis foi cortado

O item 6 do PDF pede: *"Registrar log de quem acessou dados sensíveis, com data
e hora (LGPD e proteção em caso de desligamento)"*.

**Decidido em 18/08/2026 não implementar por enquanto.** Fica registrado aqui, e
não apenas omitido, porque é requisito escrito do cliente — daqui a seis meses
ninguém lembra por que sumiu. A restrição por campo (o resto do item 6) **é**
implementada; só a trilha de auditoria fica de fora.

---

## 5. Achado do levantamento: vazamento já corrigido

Ao inventariar os caminhos de leitura de `clients` para o bloco D, apareceu uma
falha **ativa em produção**, não relacionada a nenhum dos 11 itens:

`GET /projects` fazia `LEFT JOIN clients` e devolvia `c.phone`, `c.email` e
`c.address` para qualquer usuário autenticado, **sem checar `admin_only`**. Um
cliente marcado como "visível só para admins" sumia da tela de Pessoas mas os
contatos dele continuavam saindo pela API de projetos.

Corrigido em `c0d3f06`, com teste de regressão em
`tests/integration/contactsVisibility.test.js`. Fora dos 4 blocos, de propósito:
não dependia de nenhuma definição pendente e não podia esperar.

**A lição vale para o bloco D:** se o inventário de caminhos de leitura não for
completo, a versão granular vaza igual — só que mais difícil de perceber. O
spec D traz o inventário como entregável de primeira classe.

Verificado no mesmo levantamento, e **sem** problema:
- `projects.sale_value` **não** é devolvido por `GET /projects` — valores de
  contrato já estão protegidos por omissão no backend.
- `GET /projects/deleted` é `requireAdmin`.
- A tool `lib/agent/tools/read/statusProjeto.js` expõe só o **nome** do cliente.

---

## 6. Os specs

| Arquivo | Bloco |
|---|---|
| `2026-08-18-ajustes-void-a-interface-design.md` | A — itens 9, 10, 11 |
| `2026-08-18-ajustes-void-b-pessoas-design.md` | B — itens 1, 2, 3, 4, 5 |
| `2026-08-18-ajustes-void-c-projetos-etapas-design.md` | C — itens 7, 8 |
| `2026-08-18-ajustes-void-d-visibilidade-design.md` | D — item 6 |
