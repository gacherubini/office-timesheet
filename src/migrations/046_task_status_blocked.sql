-- 046_task_status_blocked.sql
-- Coluna "Falta info" entre "Fazendo" e "Em revisão" (item 8 do PDF de ajustes
-- de 18/08/2026). Tarefa parada esperando cliente, topografia ou prefeitura não
-- é "a fazer" nem "fazendo" — separá-la deixa visível o que está travado por
-- terceiros, que é a maior fonte de atraso.
--
-- 'blocked' e não 'waiting_info' porque o RÓTULO pode mudar; o motivo (travado
-- por terceiro) não.
--
-- Mesmo padrão das migrations 015 (abandoned) e 025 (in_review): PG12+ permite
-- ADD VALUE dentro de transação desde que o valor não seja USADO na mesma
-- transação. Aqui só adicionamos.

ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'blocked' AFTER 'in_progress';
