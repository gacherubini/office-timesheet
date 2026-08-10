-- Completa o GRANT da role agent_readonly (030) com as tabelas de colaboração
-- que o domínio do agente já anuncia como consultáveis: dominio/core.md cita
-- task_attachments e task_activity, mas elas ficaram fora do GRANT e da
-- allowlist do guard — o admin só descobria isso levando uma recusa.
-- Migration nova em vez de editar a 030: a 030 já pode ter sido aplicada, e o
-- runner pula arquivo já registrado em _migrations.
-- Manter em sincronia com TABELAS_PERMITIDAS em src/lib/agent/tools/sql/guard.js.

GRANT SELECT ON task_attachments, task_activity TO agent_readonly;
