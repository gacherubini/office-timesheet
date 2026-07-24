-- Nova coluna do quadro "Em revisão": estado entre "Fazendo" e "Concluído".
-- Segue o mesmo padrão da 015 (abandoned): só adiciona o valor ao enum, sem usá-lo
-- na mesma transação (PG12+ permite ADD VALUE dentro de transação nesse caso).
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'in_review' AFTER 'in_progress';
