-- Novo status terminal "abandoned": tarefas que não foram concluídas e saem
-- do quadro ativo, mas não são apagadas (ficam recuperáveis).
-- PG12+ permite ADD VALUE dentro de transação desde que o valor não seja
-- usado na mesma transação (aqui só adicionamos).
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'abandoned';
