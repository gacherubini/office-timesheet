-- 044_user_admission.sql
-- Data de admissão e de desligamento do colaborador (item 4 do PDF de ajustes
-- de 18/08/2026). termination_date fica em branco enquanto a pessoa está ativa.
--
-- FORA DO ESCOPO de propósito: o PDF diz que a data de desligamento "é o que
-- permite depois encerrar o acesso sem apagar o histórico de horas". Isso
-- descreve uma automação FUTURA (desativar acesso na data). Aqui entra só o
-- campo — a automação é outro item, quando for pedida.
--
-- NÃO entram no SELECT do requireAuth: o userCache carrega exatamente os campos
-- de sessão que carrega hoje, e acrescentar coluna ali custaria memória em todo
-- perfil cacheado para um dado que só a ficha usa.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS admission_date   date,
  ADD COLUMN IF NOT EXISTS termination_date date;
