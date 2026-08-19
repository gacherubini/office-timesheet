-- 042_person_links.sql
-- "Uma PJ pode ter várias PF vinculadas, cada uma com um papel" (item 3 do PDF
-- de ajustes de 18/08/2026).
--
-- member_* é FK e NÃO text porque o PDF é explícito: "o vínculo é feito pelo
-- cadastro existente, nunca por texto digitado — evita a mesma pessoa
-- duplicada". Com FK, o banco recusa um sócio que não existe.
--
-- person_links_mesmo_lado evita a pergunta sem resposta "o sócio de um
-- fornecedor é um cliente?": PJ cliente vincula PF cliente, PJ fornecedor
-- vincula PF fornecedor. Não há caso de uso para cruzar os dois, e permitir
-- isso só criaria dado que ninguém sabe interpretar.

CREATE TABLE person_links (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_client_id   uuid REFERENCES clients(id)   ON DELETE CASCADE,
  company_supplier_id uuid REFERENCES suppliers(id) ON DELETE CASCADE,
  member_client_id    uuid REFERENCES clients(id)   ON DELETE CASCADE,
  member_supplier_id  uuid REFERENCES suppliers(id) ON DELETE CASCADE,
  role                text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT person_links_uma_empresa
    CHECK (num_nonnulls(company_client_id, company_supplier_id) = 1),
  CONSTRAINT person_links_uma_pessoa
    CHECK (num_nonnulls(member_client_id, member_supplier_id) = 1),
  -- Empresa e membro vivem do mesmo lado. Só se aplica quando já existe
  -- exatamente uma empresa (num_nonnulls <> 1): sem isso, uma linha sem
  -- nenhuma empresa violaria ESTE check e o `person_links_uma_empresa` ao
  -- mesmo tempo, e o Postgres reporta só um dos dois — não necessariamente
  -- o mais específico. Com o gate, o caso "sem empresa" vira violação só de
  -- `person_links_uma_empresa`, que é a mensagem que descreve o problema.
  CONSTRAINT person_links_mesmo_lado
    CHECK (
      num_nonnulls(company_client_id, company_supplier_id) <> 1
      OR (company_client_id IS NOT NULL) = (member_client_id IS NOT NULL)
    ),
  -- Papéis do item 7 do PDF. TEXT + CHECK em vez de enum: acrescentar papel
  -- vira uma migration de uma linha, sem ALTER TYPE.
  CONSTRAINT person_links_papel_valido
    CHECK (role IN ('socio', 'responsavel_tecnico', 'contato_principal', 'financeiro'))
);

-- O mesmo par não se repete, independente do papel: dois papéis para a mesma
-- pessoa na mesma empresa é edição, não linha nova.
CREATE UNIQUE INDEX person_links_par_cliente
  ON person_links(company_client_id, member_client_id)
  WHERE company_client_id IS NOT NULL;
CREATE UNIQUE INDEX person_links_par_fornecedor
  ON person_links(company_supplier_id, member_supplier_id)
  WHERE company_supplier_id IS NOT NULL;

-- "Em quais empresas esta pessoa aparece?" é a pergunta da ficha da PF.
CREATE INDEX person_links_membro_cliente_idx    ON person_links(member_client_id);
CREATE INDEX person_links_membro_fornecedor_idx ON person_links(member_supplier_id);
