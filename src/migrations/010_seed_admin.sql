-- Seed do admin inicial: só roda se a tabela users estiver vazia.
-- O password_hash bcrypt da senha INITIAL_ADMIN_PASSWORD precisa estar pré-calculado
-- e injetado pela aplicação. Pra simplificar, fazemos via app boot (não SQL).
-- Esta migration intencionalmente não faz INSERT — o seed roda em scripts/migrate.js
-- após aplicar as migrations, lendo INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD.
SELECT 1;
