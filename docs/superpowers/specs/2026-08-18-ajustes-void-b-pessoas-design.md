# Design — Bloco B: Pessoas (itens 1, 2, 3, 4, 5)

**Data:** 2026-08-18
**Status:** aprovado no brainstorming; a implementar (test-first)
**Origem:** `Gestao-VOID-ajustes-desenvolvimento.pdf`, seção "PESSOAS"
**Bloco:** B da `2026-08-18-ajustes-void-visao-geral.md`
**Destrava:** o bloco D (visibilidade) depende dos campos criados aqui

> O cadastro sai de "um campo de cada coisa" para **pessoa física ou jurídica,
> com quantos telefones, e-mails e endereços forem necessários, cada um
> identificado**, e com pessoas físicas vinculadas a jurídicas pelo cadastro —
> nunca por texto digitado.

Vale para **clientes e fornecedores**. `users` (colaboradores) recebe só os
itens 4 e 5 — é a tabela mais acoplada do sistema (auth, `userCache`, agente,
relatórios) e mexer na estrutura dela é o maior risco de regressão do projeto.

---

## 1. Decisões travadas

| Tema | Decisão | Motivo |
|---|---|---|
| Abrangência | Clientes e fornecedores. `users` só nos itens 4 e 5 | Risco de regressão em `users` |
| Tabelas filhas | Um conjunto só, `client_id` + `supplier_id` anuláveis, `CHECK (num_nonnulls(...) = 1)` | FK declarativa de verdade, sem duplicar regra, sem FK polimórfica |
| `clients.name` | **Continua sendo o nome de exibição**, inclusive para PJ | É lido por projetos, agente e relatórios. Preenchido a partir de nome fantasia / razão social no save |
| Colunas antigas | `email`, `phone`, `address` **não são removidas neste bloco** | Backfill primeiro, verificação depois, `DROP` numa migration posterior |
| ViaCEP | Chamado direto do front | Sem chave a proteger; proxy só somaria latência e um ponto de falha |
| Dados bancários | Criados nos dois cadastros | Pedido do item 6; o campo não existia |
| Cargo | Campo próprio (`users.position`), separado de `role` | Hoje são literalmente o mesmo dado. Ver §6 |

---

## 2. Modelo de dados

```
   clients                          suppliers
   ├─ person_type ('pf'|'pj')       ├─ person_type
   ├─ name  ← exibição              ├─ name
   ├─ PF: cpf, rg, birth_date       ├─ (mesmos campos)
   ├─ PJ: razao_social,             │
   │      nome_fantasia, cnpj,      │
   │      inscricao_estadual,       │
   │      founded_date              │
   └─ banco: bank_*, pix_key        └─
        │                                 │
        └──────────────┬──────────────────┘
                       │  (client_id XOR supplier_id)
        ┌──────────────┼──────────────┬────────────────┐
        ▼              ▼              ▼                ▼
  person_phones  person_emails  person_addresses  person_links
   label,value    label,value    label, cep,       PJ ↔ PF
   is_primary     is_primary     street, number,   + papel
                                 complement,
                                 district,
                                 city, uf
                                 is_primary
```

### Migration 040 — tipo de pessoa e campos novos

```sql
CREATE TYPE person_type AS ENUM ('pf', 'pj');

ALTER TABLE clients
  ADD COLUMN person_type        person_type NOT NULL DEFAULT 'pf',
  ADD COLUMN rg                 text,
  ADD COLUMN razao_social       text,
  ADD COLUMN nome_fantasia      text,
  ADD COLUMN cnpj               text,
  ADD COLUMN inscricao_estadual text,
  ADD COLUMN founded_date       date,
  ADD COLUMN bank_name          text,
  ADD COLUMN bank_agency        text,
  ADD COLUMN bank_account       text,
  ADD COLUMN bank_account_type  text,
  ADD COLUMN pix_key            text;
-- idem para suppliers
```

`DEFAULT 'pf'` é o que faz o backfill dos existentes ser trivial: todo cliente
de hoje foi cadastrado com nome e CPF, então é pessoa física.

**Por que `name` sobrevive.** `clients.name` é lido por `GET /projects`
(`COALESCE(c.name, p.client)`), pela tool `statusProjeto.js` do agente e pela
tela de Pessoas. Transformá-lo em campo derivado obrigaria a mexer em todos.
Em vez disso: para PJ, o save preenche `name` com `nome_fantasia` (ou
`razao_social` quando não houver fantasia). Um `CHECK` garante coerência mínima:

```sql
CHECK (person_type = 'pf' OR razao_social IS NOT NULL)
```

### Migration 041 — contatos

Padrão idêntico nas três (exemplo com telefones):

```sql
CREATE TABLE person_phones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid REFERENCES clients(id)   ON DELETE CASCADE,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE CASCADE,
  label       text NOT NULL,
  value       text NOT NULL,
  is_primary  boolean NOT NULL DEFAULT false,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT person_phones_um_dono CHECK (num_nonnulls(client_id, supplier_id) = 1)
);

-- "um marcado como principal" vira invariante do banco, não do formulário
CREATE UNIQUE INDEX person_phones_principal_cliente
  ON person_phones(client_id) WHERE is_primary AND client_id IS NOT NULL;
CREATE UNIQUE INDEX person_phones_principal_fornecedor
  ON person_phones(supplier_id) WHERE is_primary AND supplier_id IS NOT NULL;
```

O índice parcial é o coração da tabela: o PDF pede "um marcado como principal
(o que aparece nas listagens)". Deixar isso só na UI garante que um dia
existam dois principais e a listagem escolha um deles por sorte.

`person_addresses` tem os campos separados que o CEP preenche:
`cep, street, number, complement, district, city, uf`.

**Rótulos** são `text`, não enum. O PDF pede lista pronta **"com opção de
digitar um personalizado"** — enum tornaria isso impossível sem migration. A
lista sugerida vive no front (mesmo precedente do `web/src/lib/taskTypes.js`):

| Tipo | Sugestões |
|---|---|
| Telefone | celular, WhatsApp, comercial, residencial, recado |
| E-mail | pessoal, comercial, financeiro / nota fiscal |
| Endereço | residencial, sede, obra, cobrança |

### Migration 042 — vínculo PJ ↔ PF

```sql
CREATE TABLE person_links (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_client_id   uuid REFERENCES clients(id)   ON DELETE CASCADE,
  company_supplier_id uuid REFERENCES suppliers(id) ON DELETE CASCADE,
  member_client_id    uuid REFERENCES clients(id)   ON DELETE CASCADE,
  member_supplier_id  uuid REFERENCES suppliers(id) ON DELETE CASCADE,
  role                text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT person_links_uma_empresa CHECK (num_nonnulls(company_client_id, company_supplier_id) = 1),
  CONSTRAINT person_links_uma_pessoa  CHECK (num_nonnulls(member_client_id,  member_supplier_id)  = 1),
  -- empresa e pessoa vivem do mesmo lado: PJ cliente vincula PF cliente
  CONSTRAINT person_links_mesmo_lado
    CHECK ((company_client_id IS NULL) = (member_client_id IS NULL))
);
```

`person_links_mesmo_lado` evita a pergunta sem resposta "o sócio de um
fornecedor é um cliente?". Papéis (item 3): `socio`, `responsavel_tecnico`,
`contato_principal`, `financeiro`.

**"O vínculo é feito pelo cadastro existente, nunca por texto digitado"** — o
PDF é explícito, e é por isso que `member_*` é FK e não `text`. Na tela, o
campo é um picker sobre o cadastro, com atalho "criar pessoa" que abre o
formulário e volta com o id.

### Migration 043 — backfill

```sql
INSERT INTO person_phones (client_id, label, value, is_primary)
SELECT id, 'principal', phone, true FROM clients
WHERE phone IS NOT NULL AND btrim(phone) <> '';
-- idem e-mails; idem suppliers
```

Endereço é o caso chato: hoje `clients.address` é **texto livre**, e o modelo
novo é estruturado. O backfill joga o texto inteiro em `street` e marca
`label = 'principal'`. Não tenta adivinhar rua/número/cidade — parser de
endereço brasileiro erra, e errar aqui é pior que não estruturar.

As colunas antigas **continuam existindo e populadas**. É o que torna esta
migration reversível: se algo der errado, os leitores voltam a lê-las com um
revert de código, sem restore de banco. O `DROP` é uma migration posterior,
depois de verificação em produção.

---

## 3. Item 1 — busca de endereço por CEP

O CEP é o **primeiro campo** do formulário de endereço. Ao completar 8 dígitos,
busca e preenche rua, bairro, cidade e UF. Número e complemento seguem à mão.

`web/src/hooks/useCep.js`:

```
digita CEP → 8 dígitos? → GET https://viacep.com.br/ws/{cep}/json/
                            │
              ┌─────────────┼──────────────┬───────────────┐
              ▼             ▼              ▼               ▼
          200 + dados   200 {erro:true}  timeout/rede   4xx/5xx
              │             │              │               │
         preenche      libera manual   libera manual   libera manual
         (editável)    + aviso brando  + aviso brando  + aviso brando
```

Regras que o PDF fixa e o teste tem que provar:

- **Nunca trava o cadastro.** Todo caminho de falha libera o preenchimento
  manual. O aviso é informativo, não bloqueante.
- **Campos preenchidos continuam editáveis.** Nada de `readOnly` depois da
  busca — o ViaCEP erra em loteamento novo.
- Uma requisição por CEP completo, com cancelamento (`AbortController`) se o
  usuário continuar digitando.

**Por que direto do front, sem proxy:** não há chave a proteger e o ViaCEP
libera CORS. Um proxy no Express somaria um hop de latência e um ponto de falha
para zero ganho. Contrapartida aceita: o IP do usuário chega ao ViaCEP — para
consulta de CEP público, irrelevante.

**Aceite:** *"Digitei o CEP e rua, bairro, cidade e UF vieram preenchidos."*

---

## 4. Itens 2 e 3 — API e telas

### Endpoints

| Método | Rota | Muda |
|---|---|---|
| `GET` | `/admin/clients` | Passa a trazer só os **principais** (LATERAL sobre as filhas), não as listas inteiras — é uma listagem |
| `GET` | `/admin/clients/:id` | **Novo.** Ficha completa: `phones[]`, `emails[]`, `addresses[]`, `links[]` |
| `POST` / `PUT` | `/admin/clients[/:id]` | Aceitam as listas aninhadas; gravam em transação |

Espelhado em `/admin/suppliers`.

**Escrita como substituição total, em transação.** O `PUT` recebe as listas
completas e o servidor apaga e reinsere as filhas daquele dono dentro de um
`withTransaction` (já existe em `lib/db.js`). Motivo: é exatamente como um
formulário salva. A alternativa (diff por id, `PATCH` por linha) multiplica
endpoints e estados de erro para um ganho que não existe num cadastro editado
por uma pessoa de cada vez.

Validação no servidor, não só na tela:
- No máximo um `is_primary` por tipo por dono (o índice parcial garante; a rota
  devolve erro legível em vez de deixar vazar erro de constraint).
- Se houver ao menos um item de um tipo, exatamente um é principal — o servidor
  promove o primeiro se o cliente não marcar nenhum.
- `label` e `value` não vazios.

### Leitores que precisam mudar de fonte

Depois do backfill, `clients.phone`/`email`/`address` ficam congelados. Quem os
lê passa a ler o principal da tabela filha:

| Arquivo | Hoje |
|---|---|
| `src/routes/projects.js:66` | `c.phone`, `c.email`, `c.address` no `GET /projects` (já com o gate de `admin_only` de `c0d3f06`) |
| `src/routes/clients.js:73` | listagem |
| `src/routes/suppliers.js` | listagem |

Um `LEFT JOIN LATERAL (... WHERE is_primary LIMIT 1)` resolve os três, no mesmo
formato que `clients.js:73` já usa para contar anexos.

### Telas

`ClientFormModal.jsx` tem 253 linhas e `SupplierFormModal.jsx` 134 — com
PF/PJ, listas repetíveis e CEP, os dois estourariam. Extrair o que é comum:

```
components/pessoas/
├── PersonTypeToggle.jsx     PF | PJ — troca os campos do formulário
├── ContactListField.jsx     telefones e e-mails (rótulo + valor + principal)
├── AddressListField.jsx     endereços, CEP primeiro, via useCep
├── PersonLinksField.jsx     picker PJ→PF sobre o cadastro + papel
└── BankFields.jsx           dados bancários (restritos, ver bloco D)
```

`ClientFormModal` e `SupplierFormModal` passam a compor esses blocos. É o que
impede a regra de "principal" e a de rótulo de divergirem entre as duas telas.

**Aceites:** *"Cadastro dois telefones na mesma pessoa, identificados como
celular e comercial, e defino o principal."* · *"Cadastro uma construtora como
PJ, vinculo o sócio e o contato do financeiro, e ambos aparecem na ficha da
empresa."*

---

## 5. Item 4 — admissão e desligamento do colaborador

```sql
ALTER TABLE users
  ADD COLUMN admission_date   date,
  ADD COLUMN termination_date date;
```

- Ficha do colaborador mostra a data de admissão e o **tempo de casa**
  (calculado no front a partir de `admission_date`; não é coluna).
- `termination_date` fica em branco enquanto ativo.
- Não entram no `SELECT` do `requireAuth` — o `userCache` continua carregando
  exatamente os campos de sessão que carrega hoje.

**Fora do escopo, de propósito:** o PDF diz que a data de desligamento "é o que
permite depois encerrar o acesso sem apagar o histórico de horas". Isso descreve
uma **funcionalidade futura** (desativar acesso automaticamente na data). Este
bloco entrega o **campo**; a automação é outro item, quando pedida. Registrado
para não parecer esquecimento.

**Aceite:** *"A ficha do colaborador mostra a data de admissão e o tempo de casa."*

---

## 6. Item 5 — "Arquiteto" no lugar de "Colaborador"

### Isto não é troca de texto

`web/src/pages/PessoasPage.jsx:368`:

```js
position: roleLabel(form.role),
```

O **cargo** (`position`) é gravado como o rótulo do **perfil de permissão**
(`role`). São o mesmo dado. É por isso que aparece "Colaborador" como cargo: é
`roleLabel('employee')`. Trocar a string por "Arquiteto" faria todo admin virar
"Administrador" de cargo e todo gestor virar "Gestor de Projetos" — o problema
continuaria, só com outra palavra.

O PDF viu isso e escreveu a distinção: *"cargo é o que a pessoa faz (arquiteto,
estagiário, administrativo, sócio) e aparece na tela; perfil de permissão é o
que ela pode fazer no sistema (admin ou padrão). São campos separados."*

### O que muda

- `position` vira **campo próprio** no formulário: select com Arquiteto,
  Estagiário, Administrativo, Sócio + opção de digitar.
- Default na criação: **Arquiteto**.
- `role` continua o campo de permissão, sem alteração de valores nem de
  `lib/permissions.js`.
- A linha 368 some. `PessoasPage.jsx:227` (`row.position || roleLabel(row.role)`)
  pode ficar: é fallback para quem não tem cargo.

### Onde `position` é escrito hoje (os três pontos a remover)

Não é só a tela. `position` **nunca** é digitado por ninguém:

| Arquivo | Linha | O que faz |
|---|---|---|
| `web/src/pages/PessoasPage.jsx` | 368 | front envia `position: roleLabel(form.role)` |
| `src/routes/users.js` | 97 | criação **ignora** o que o front mandou e grava `roleLabel(role)` |
| `src/routes/users.js` | 207 | edição sobrescreve `position` sempre que `role` vier no corpo |

Os três somem. `position` passa a ser o que o formulário mandar.

Cuidado ao mexer: `roleLabel()` é usada em **8 outros lugares** para exibir a
**permissão** — `PessoasPage.jsx:1029` e `:1043` a renderizam dentro de
`<DetailRow label="Perfil">`. Mudar o retorno de `roleLabel` para "Arquiteto"
faria a ficha dizer "Perfil: Arquiteto", que é exatamente a confusão que o item
5 pede para desfazer. A função fica intacta; o que muda é quem chama.

### Backfill: decisão adiada (18/08/2026)

O que fazer com quem já tem `'Colaborador'`, `'Administrador'` ou
`'Gestor de Projetos'` gravado **ainda não foi decidido**. Opções na mesa:

1. Só `'Colaborador' → 'Arquiteto'` (o que o PDF pede, literal).
2. Zerar tudo e o admin preenche (exige ajustar o fallback de
   `PessoasPage.jsx:227`, que hoje cai em `roleLabel()`).
3. Mapear todos por inferência — desaconselhado: é inferir cargo a partir de
   permissão, o erro que estamos consertando.

**Isto não bloqueia o resto do item 5.** Separar os campos e parar de
sobrescrever `position` pode ser implementado antes; o backfill é uma migration
de uma linha que entra quando a decisão sair. Enquanto isso, o dado antigo fica
como está e ninguém perde nada.

**Aceite:** *"Ao criar um usuário, o cargo padrão é 'Arquiteto' e a permissão é
escolhida em campo próprio."*

---

## 7. Aniversariantes: só pessoas físicas — e uma pergunta

O PDF pede: *"No card de aniversariantes da tela inicial, listar apenas pessoas
físicas."*

**Verificado no código:** `GET /birthdays` (`src/routes/me.js:691`) e
`GET /me/team-birthdays` (`:529`) leem **só a tabela `users`**. Cliente nenhum
aparece no card hoje, embora `clients.birth_date` exista desde a migration 019 e
seja preenchido no formulário.

Ou seja, o requisito só faz sentido se o João Pedro **espera ver aniversário de
cliente ali** — todo colaborador é pessoa física, a ressalva seria vazia.

**O que este spec faz:** implementa a guarda (`person_type = 'pf'`) em todo
leitor de aniversário, de modo que PJ nunca entre. **O que não faz:** adicionar
clientes ao card, porque isso é funcionalidade nova e não está pedida em lugar
nenhum do PDF.

**Decidido em 18/08/2026: cliente NÃO entra no card.** Fica só a guarda de PF,
pronta para o dia em que entrar. Adicionar aniversário de cliente à tela inicial
seria funcionalidade nova, e ainda esbarraria em privacidade — o card é a
primeira tela e ficaria visível para a equipe inteira.

Se o João Pedro disser que era isso que ele queria, volta como item próprio: a
guarda já estará no lugar e o custo é pequeno (`clients.birth_date` existe desde
a migration 019 e já é preenchido no formulário).

---

## 8. Testes

| Nível | Caso |
|---|---|
| integration | dois telefones no mesmo cliente, rótulos distintos, um principal |
| integration | tentar dois principais do mesmo tipo → erro legível, não erro de constraint cru |
| integration | nenhum principal marcado → servidor promove o primeiro |
| integration | `CHECK` de dono: linha com `client_id` **e** `supplier_id` é rejeitada |
| integration | linha com os dois nulos é rejeitada |
| integration | PJ com dois vínculos (sócio, financeiro) aparece na ficha com os papéis |
| integration | vínculo entre lados diferentes (PJ cliente ↔ PF fornecedor) é rejeitado |
| integration | `PUT` remove um telefone e mantém os outros, em transação |
| integration | apagar cliente cascateia as filhas |
| integration | PJ sem `razao_social` é rejeitado pelo `CHECK` |
| migration | backfill: cliente com phone/email/address vira 3 linhas principais; cliente vazio não gera linha |
| migration | `position = 'Colaborador'` vira 'Arquiteto'; 'Administrador' fica intacto |
| unit front | `useCep`: 8 dígitos dispara; `{erro:true}` libera manual; timeout libera manual; campos seguem editáveis |
| unit | aniversariantes ignora `person_type = 'pj'` |

---

## 9. Ordem de implementação

1. Migrations 040–043 com os testes de constraint e de backfill. **Nenhuma tela
   ainda** — o banco correto primeiro.
2. API de clientes (leitura com LATERAL, ficha completa, escrita em transação).
3. Mesmo para fornecedores, reusando o que a etapa 2 extraiu.
4. Trocar a fonte dos leitores (`projects.js`, listagens).
5. Componentes de formulário (`ContactListField`, `AddressListField`, `useCep`).
6. PF/PJ e vínculos na tela.
7. Itens 4 e 5 (admissão, cargo) — independentes do resto, podem ir a qualquer
   momento; ficam no fim por serem os menores.

O `DROP` das colunas antigas **não** está nesta lista de propósito: é uma
migration separada, depois de o sistema rodar em produção lendo as tabelas
filhas.
