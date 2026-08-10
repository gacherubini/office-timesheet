-- Troca o índice GiST "plano" por EXCLUDE real: inserts concorrentes sobrepostos
-- passam a falhar com 23P01 em vez de vazar (TOCTOU do check+insert).
-- Requer btree_gist (001_extensions.sql).

DROP INDEX IF EXISTS vacation_requests_no_user_overlap;

ALTER TABLE vacation_requests
  ADD CONSTRAINT vacation_requests_no_user_overlap
  EXCLUDE USING gist (
    user_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  )
  WHERE (status IN ('pending', 'approved'));
