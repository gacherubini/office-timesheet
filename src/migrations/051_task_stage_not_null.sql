-- 051_task_stage_not_null.sql
-- Fecha o item 8: "toda tarefa pertence a uma etapa — campo obrigatório".
--
-- SEPARADA DA 049 DE PROPÓSITO. O backfill precisou rodar e ser CONFERIDO em
-- produção antes desta subir: um ALTER TABLE que falha no meio de um deploy é o
-- pior momento para descobrir uma tarefa órfã.
--
-- Rede de segurança: se ainda houver órfã, esta migration falha com uma
-- mensagem que diz o que fazer, em vez de um erro de constraint cru.
DO $$
DECLARE orfas integer;
BEGIN
  SELECT count(*) INTO orfas FROM tasks WHERE stage_id IS NULL;
  IF orfas > 0 THEN
    RAISE EXCEPTION 'Ainda há % tarefa(s) sem etapa. Rode a 049 antes desta migration.', orfas;
  END IF;
END $$;

ALTER TABLE tasks ALTER COLUMN stage_id SET NOT NULL;

-- task_type cumpriu o papel dele: virou stage_id na 049. Manter os dois seria
-- dois campos com o mesmo significado, confundindo a tela e o agente.
DROP INDEX IF EXISTS tasks_task_type_idx;
ALTER TABLE tasks DROP COLUMN IF EXISTS task_type;
