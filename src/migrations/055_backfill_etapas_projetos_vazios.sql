-- 055_backfill_etapas_projetos_vazios.sql
-- Fecha um buraco deixado pelo bloco C (item 8 do PDF de 18/08/2026): projeto
-- que já existia e estava SEM TAREFAS ficou sem nenhuma etapa, e por isso
-- ficou impossível criar tarefa nele.
--
-- Como o buraco apareceu — cada peça está certa sozinha:
--   * a 049 deriva a etapa do `task_type` de cada tarefa, então projeto sem
--     tarefa não tinha de onde derivar nada;
--   * a 048 é só DDL, sem backfill;
--   * o catálogo inteiro só é semeado em POST /projects, ou seja, em projeto
--     NOVO (ver "Item 1 do brief de 19/08/2026" em src/routes/projects.js).
-- Junte as três com o NOT NULL da 051 e a validação da rota de tarefas
-- ("A tarefa precisa de uma etapa") e o resultado é um projeto travado.
--
-- Travado para quem, exatamente: criar tarefa é `requireAuth` (qualquer um),
-- mas criar etapa é `requireProjectManagement`. O arquiteto abre a obra
-- antiga, o seletor de etapa vem vazio e ele nem enxerga o botão "Gerenciar
-- etapas" que resolveria — não tem saída dentro da própria tela.
--
-- MESMA REGRA DO PROJETO NOVO, de propósito: catálogo ativo inteiro, na ordem
-- do catálogo, como CÓPIA (nome e position materializados, catalog_id só como
-- procedência — ver o comentário da 048). Quem não usa uma etapa remove em
-- "Gerenciar etapas"; é opt-out, igual ao projeto novo.
--
-- NÃO filtra `deleted_at IS NULL`: projeto excluído pode voltar
-- (POST /projects/:id/restore) e voltaria travado do mesmo jeito. Semear
-- etapa numa linha excluída não custa nada nem aparece em lugar nenhum.
--
-- Idempotente por duas vias (o deploy sempre roda de novo): o NOT EXISTS já
-- exclui todo projeto que tenha QUALQUER etapa, e o ON CONFLICT cobre a
-- corrida improvável de alguém criar a etapa no meio do deploy.

INSERT INTO project_stages (project_id, catalog_id, name, position)
SELECT p.id, sc.id, sc.name, sc.position
  FROM projects p
 CROSS JOIN stage_catalog sc
 WHERE NOT sc.is_archived
   -- Só projeto TOTALMENTE vazio. Projeto que já tem etapa foi curado pela
   -- 049 ou pela mão de alguém; empilhar o catálogo por cima sobrescreveria
   -- essa escolha — mesmo raciocínio de "projeto COM template não ganha o
   -- catálogo" em POST /projects.
   AND NOT EXISTS (SELECT 1 FROM project_stages s WHERE s.project_id = p.id)
ON CONFLICT (project_id, name) DO NOTHING;
