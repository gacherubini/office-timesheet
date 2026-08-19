-- 045_project_clients.sql
-- "Um projeto pode ter mais de um contratante — casal, sócios, investidor mais
-- construtora. A relação entre projeto e cliente passa a ser de vários para
-- vários." (item 7 do PDF de ajustes de 18/08/2026)
--
-- projects.client_id NÃO É REMOVIDA. Ela aparece em pontos de leitura de
-- routes/projects.js e na tool statusProjeto.js do agente. Mantê-la
-- sincronizada com o contratante principal deixa todos esses leitores
-- funcionando sem alteração enquanto as telas novas leem daqui. A sincronia é
-- responsabilidade da rota de escrita, na mesma transação — NÃO de trigger:
-- trigger que reescreve coluna de outra tabela é o tipo de mágica que ninguém
-- encontra quando dá errado.

CREATE TABLE project_clients (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_id  uuid NOT NULL REFERENCES clients(id)  ON DELETE RESTRICT,
  role       text NOT NULL DEFAULT 'contratante',
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, client_id),

  -- Papéis do item 7. TEXT + CHECK em vez de enum: acrescentar papel vira uma
  -- migration de uma linha, sem ALTER TYPE.
  CONSTRAINT project_clients_papel_valido
    CHECK (role IN ('contratante_principal', 'contratante', 'investidor', 'representante'))
);

-- "Um cliente é marcado como principal e é o que aparece no card e no
-- cabeçalho do projeto" — invariante do banco, não do formulário.
CREATE UNIQUE INDEX project_clients_um_principal
  ON project_clients(project_id) WHERE is_primary;

-- "Na ficha da pessoa, o contador de projetos considera todos os papéis."
CREATE INDEX project_clients_client_idx ON project_clients(client_id);

-- Backfill: o cliente único de hoje vira o contratante principal.
INSERT INTO project_clients (project_id, client_id, role, is_primary)
SELECT p.id, p.client_id, 'contratante_principal', true
  FROM projects p
 WHERE p.client_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM project_clients pc WHERE pc.project_id = p.id);
