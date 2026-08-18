# Design — Bloco D: Visibilidade por informação (item 6)

**Data:** 2026-08-18
**Status:** aprovado no brainstorming; a implementar (test-first)
**Origem:** `Gestao-VOID-ajustes-desenvolvimento.pdf`, item 6
**Bloco:** D da `2026-08-18-ajustes-void-visao-geral.md`
**Depende de:** bloco B — CNPJ, RG, inscrição estadual e dados bancários nascem lá

> A restrição sai de "o contato inteiro aparece ou não" para "**esta
> informação** aparece ou não". Cada campo sensível e cada documento anexado
> ganha um controle próprio; para o colaborador, o que está restrito
> simplesmente **não existe** na resposta.

**O log de acesso pedido pelo PDF está fora do escopo** — decisão de
18/08/2026. Ver §7.

---

## 1. Decisões travadas

| Tema | Decisão | Motivo |
|---|---|---|
| Campos escalares | Tabela `person_restricted_fields`, presença = restrito | "Cada dado pode ser marcado individualmente". Coluna `*_restricted` por campo não escala e vira migration a cada campo novo |
| Contatos e anexos | Coluna `is_restricted` na própria linha | Cada telefone é uma linha; o lugar natural do flag é ela |
| Campos restringíveis | **Allowlist no servidor** | Ninguém pode restringir `name` e apagar os cards do sistema |
| Aplicação | Um único ponto (`lib/personVisibility.js`), nunca rota a rota | Ver §5. Foi exatamente assim que o vazamento de `c0d3f06` aconteceu |
| Formato | A chave é **omitida** do JSON, não vem `null` | "Nem mascarado, nem com aviso" |
| `admin_only` | **Mantido**, ao lado do novo | São coisas diferentes. Ver §3 |
| Log de acesso | Fora do escopo | §7 |

---

## 2. Modelo

```
  clients / suppliers
        │
        ├── person_restricted_fields          ← campos escalares
        │      (client_id XOR supplier_id, field_name)
        │      presença da linha = restrito
        │
        ├── person_phones.is_restricted       ← por linha
        ├── person_emails.is_restricted
        ├── person_addresses.is_restricted
        │
        └── client_attachments.is_restricted  ← por documento
```

### Migration 050

```sql
CREATE TABLE person_restricted_fields (
  client_id   uuid REFERENCES clients(id)   ON DELETE CASCADE,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE CASCADE,
  field_name  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prf_um_dono CHECK (num_nonnulls(client_id, supplier_id) = 1)
);

CREATE UNIQUE INDEX prf_cliente ON person_restricted_fields(client_id, field_name)
  WHERE client_id IS NOT NULL;
CREATE UNIQUE INDEX prf_fornecedor ON person_restricted_fields(supplier_id, field_name)
  WHERE supplier_id IS NOT NULL;

ALTER TABLE person_phones       ADD COLUMN is_restricted boolean NOT NULL DEFAULT false;
ALTER TABLE person_emails       ADD COLUMN is_restricted boolean NOT NULL DEFAULT false;
ALTER TABLE person_addresses    ADD COLUMN is_restricted boolean NOT NULL DEFAULT false;
ALTER TABLE client_attachments  ADD COLUMN is_restricted boolean NOT NULL DEFAULT false;
```

**Presença da linha = restrito**, em vez de um booleano. Assim o estado normal
(campo visível) não ocupa linha nenhuma, e a tabela fica pequena e óbvia de ler.

`field_name` não é enum, mas a rota só aceita nomes da allowlist:

```js
// src/lib/personVisibility.js
export const CAMPOS_RESTRINGIVEIS = new Set([
  'cpf', 'rg', 'birth_date',
  'cnpj', 'inscricao_estadual', 'razao_social', 'founded_date',
  'bank_name', 'bank_agency', 'bank_account', 'bank_account_type', 'pix_key',
  'notes',
])
```

`name` fica **de fora de propósito**: é o nome de exibição, lido por
`GET /projects`, pelo agente e pelos relatórios. Restringi-lo apagaria cards de
projeto e quebraria telas que nada têm a ver com PII.

### Nascem restritos

O PDF: *"Nascem restritos por padrão: CPF, CNPJ, RG, dados bancários e valores
de contrato."*

Na criação de cliente/fornecedor, a rota insere as linhas de
`person_restricted_fields` para: `cpf`, `rg`, `cnpj`, `bank_*`, `pix_key`.
Na mesma transação do `INSERT`.

**"Valores de contrato" já está resolvido** — verificado no levantamento:
`projects.sale_value` **não** é devolvido por `GET /projects`, e
`canAccessMoney()` (`lib/permissions.js`) já é `isAdmin`. Nenhum trabalho novo.

Migration de backfill para os cadastros que já existem: mesma lista, aplicada a
todo cliente e fornecedor atual. É a leitura correta de "nascem restritos" com
dado legado — o contrário (legado nasce aberto) deixaria justamente os cadastros
reais desprotegidos.

---

## 3. `admin_only` continua, e não é redundante

O PDF diz *"Hoje a decisão é abrir ou não o contato inteiro. Precisa ser por
informação"*. Dá para ler como substituição. Este spec **mantém as duas**,
porque respondem a perguntas diferentes:

| Controle | Pergunta |
|---|---|
| `admin_only` (migration 017) | "O colaborador pode saber que **esta pessoa existe**?" |
| `person_restricted_fields` | "O colaborador pode ver **este dado** dela?" |

Compõem: cliente `admin_only` some inteiro; cliente comum aparece com o CPF
oculto. Remover `admin_only` deixaria sem resposta o caso "cliente sigiloso que
nem deve aparecer na lista" — e há dado em produção usando isso hoje.

⚠️ **Confirmar com o João Pedro:** ele quer manter a chave "esconder a pessoa
inteira", ou a intenção era substituí-la de vez pela restrição por campo?

---

## 4. Inventário dos caminhos de leitura

**Este é o entregável mais importante do bloco**, e não a tabela. O `admin_only`
já falhou exatamente aqui: estava certo em `/admin/clients` e vazava em
`GET /projects` (corrigido em `c0d3f06`). Trocar um booleano por uma matriz
multiplica as chances do mesmo erro.

Levantado em 2026-08-18 com
`grep -rn "FROM clients\|JOIN clients\|FROM suppliers\|JOIN suppliers" src/routes src/lib`:

| # | Caminho | Expõe | Situação |
|---|---|---|---|
| 1 | `routes/clients.js:73` — `GET /admin/clients` | listagem completa | filtra `admin_only`; **precisa** do filtro por campo |
| 2 | `GET /admin/clients/:id` (novo no bloco B) | ficha completa | **precisa** |
| 3 | `routes/clients.js:186` — anexos | documentos | **precisa** do `is_restricted` |
| 4 | `routes/suppliers.js:61` | listagem | filtra `admin_only`; **precisa** |
| 5 | `routes/projects.js:66` — `GET /projects` | `client_phone/email/address` | gate de `admin_only` desde `c0d3f06`; **precisa** do por-campo |
| 6 | `routes/projects.js:83` — `/projects/deleted` | idem | `requireAdmin` — ok |
| 7 | `routes/projects.js:110,184` | só `name` | ok, `name` não é restringível |
| 8 | `lib/agent/tools/read/statusProjeto.js:53` | só `name` | ok |
| 9 | `lib/agent/tools/sql/consultarDados.js` | SQL livre sobre `clients`/`suppliers` | **`roles: ['admin']`** — verificado. Sem bypass |

O item 9 merecia o susto: a role `agent_readonly` (migrations 030/031) tem
`GRANT SELECT` em `clients` e `suppliers`, e SQL ad-hoc atravessaria qualquer
filtro de aplicação. `consultarDados.js:61` é `roles: ['admin']` e
`registry.js:7` filtra por papel, então só admin alcança a tool — e admin vê
tudo mesmo. **Sem ação necessária, mas quem mexer nesse papel no futuro precisa
saber que isto está aqui.** Registrado por isso.

**Teste de cobertura do inventário.** Um teste percorre esta tabela e, para cada
caminho marcado "precisa", faz a requisição como colaborador e afirma que
nenhuma chave restrita voltou. É o que impede o item 10 de amanhã de nascer
vazando.

---

## 5. Um só ponto de aplicação

A tentação é filtrar em cada rota. Foi assim que o vazamento aconteceu: o autor
de `GET /projects` não estava pensando em `admin_only`, e nada o obrigava a
pensar.

```
              rota monta o registro cru
                        │
                        ▼
        lib/personVisibility.js
        ┌───────────────────────────────────────┐
        │ aplicarVisibilidade(profile, pessoa)  │
        │                                       │
        │  isAdmin?  → devolve intacto          │
        │  senão     → remove as chaves de      │
        │              person_restricted_fields │
        │              e as linhas is_restricted│
        └───────────────────────────────────────┘
                        │
                        ▼
                   res.json(...)
```

Assinatura:

```js
aplicarVisibilidade(profile, pessoa, restritos)   // um registro
aplicarVisibilidadeEmLista(profile, pessoas, restritosPorId)
```

Função **pura** — recebe o conjunto de campos restritos já carregado, não vai ao
banco. Testável isolada, mesmo precedente de `lib/birthdays.js` e
`lib/performanceSimulation.js`, que o repo já segue.

A carga dos restritos entra como `LEFT JOIN LATERAL` agregando
`person_restricted_fields` em array, junto da query que já existe — sem N+1.

**A chave é omitida, não anulada.** `delete pessoa.cpf`, e não
`pessoa.cpf = null`. O PDF é literal: *"o campo restrito simplesmente não
aparece — nem mascarado, nem com aviso"*. Na tela, campo ausente não renderiza
rótulo; um `null` renderizaria "CPF: —", que é justamente o aviso que não pode
existir.

Consequência para o front: os formulários de edição só mostram o campo se ele
vier na resposta. E o `PUT` **não pode apagar** o que não recebeu — a rota
preserva o valor atual de todo campo restrito que o autor da requisição não
podia ver. Sem isso, um colaborador salvando o cadastro zeraria o CPF sem nunca
tê-lo visto. Este é o bug mais provável do bloco inteiro, e tem teste próprio.

---

## 6. Tela

- Ao lado de cada campo sensível e de cada anexo, um controle de visibilidade
  (ícone de cadeado), **visível só para admin** — quem não pode mudar não vê o
  controle.
- Dois estados: *visível para a equipe* / *restrito ao admin*.
- Nos componentes que o bloco B extrai (`ContactListField`, `AddressListField`,
  `BankFields`), o controle é uma prop — não código novo por campo.
- `ClientAttachments.jsx` ganha o mesmo controle por linha.

---

## 7. O log de acesso ficou de fora

O PDF pede: *"Registrar log de quem acessou dados sensíveis, com data e hora
(LGPD e proteção em caso de desligamento)."*

**Decidido em 18/08/2026 não implementar por enquanto.** Registrado aqui, e não
omitido, porque é requisito escrito do cliente: daqui a seis meses ninguém
lembra por que sumiu, e alguém vai supor que foi esquecimento.

O que isso significa na prática:
- A **restrição** por campo é implementada por inteiro. É ela que impede o
  acesso.
- A **trilha de auditoria** — quem viu o quê e quando — não existe. Não é
  possível reconstruir depois: log não registrado é dado que nunca existiu.
- Se for pedido no futuro, o ponto de captura é óbvio e único:
  `aplicarVisibilidade()` já sabe quem é o perfil e quais campos foram
  entregues. É um `INSERT` ali dentro e uma tabela. O desenho deste bloco já
  deixa esse gancho pronto, de propósito.

A pendência do PDF sobre **por quanto tempo guardar os logs** fica sem efeito
enquanto não houver log.

---

## 8. Testes

| Nível | Caso |
|---|---|
| unit | `aplicarVisibilidade`: admin recebe intacto |
| unit | colaborador: chave restrita **ausente** (`'cpf' in obj === false`), não `null` |
| unit | campo fora da allowlist é ignorado se aparecer na tabela |
| integration | cliente com CPF restrito: colaborador não recebe em `/admin/clients` nem em `/admin/clients/:id` |
| integration | telefone com `is_restricted`: colaborador recebe os outros, não esse |
| integration | telefone restrito **era** o principal → colaborador vê o próximo, não uma lista vazia |
| integration | anexo restrito não aparece na lista **e** o download por id dá 404 |
| integration | `GET /projects`: contato restrito não sai (por-campo, além do `admin_only`) |
| integration | **`PUT` por colaborador preserva o CPF restrito** que ele não recebeu |
| integration | não-admin tentando marcar/desmarcar restrição → 403 |
| integration | cliente novo nasce com cpf/cnpj/rg/bancários restritos |
| migration | backfill marca os cadastros existentes |
| integration | **cobertura do inventário**: varre a tabela do §4 e afirma que nenhum caminho vaza campo restrito para colaborador |

Aceite do PDF: *"Oculto o CPF de um cliente e anexo um contrato como restrito;
no login de arquiteto, nenhum dos dois aparece."*

---

## 9. Ordem de implementação

1. `lib/personVisibility.js` puro + testes unitários. Sem banco, sem rota.
2. Migration 050 + backfill dos restritos padrão.
3. Aplicar nas rotas de cliente e fornecedor (leitura **e** a preservação no `PUT`).
4. Anexos.
5. `GET /projects`.
6. Teste de cobertura do inventário — **antes** da tela, para nenhum caminho
   ficar para trás.
7. Controle de visibilidade na interface.

O passo 1 primeiro é o que garante que a regra viva num lugar só. Se as rotas
vierem antes, cada uma inventa a sua.
