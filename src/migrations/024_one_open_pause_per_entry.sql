-- Impede duas pausas abertas no mesmo apontamento (duplo-pause). Duas pausas
-- abertas sobrepostas fariam o stop descontar tempo a mais → risco de
-- subpagamento. Antes de criar o índice, resolve duplicatas eventuais
-- mantendo a pausa aberta mais antiga por apontamento.
DELETE FROM time_entry_pauses p
USING time_entry_pauses q
WHERE p.resumed_at IS NULL
  AND q.resumed_at IS NULL
  AND p.time_entry_id = q.time_entry_id
  AND p.paused_at > q.paused_at;

CREATE UNIQUE INDEX IF NOT EXISTS one_open_pause_per_entry
  ON time_entry_pauses(time_entry_id)
  WHERE resumed_at IS NULL;
