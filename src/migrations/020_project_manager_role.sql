-- Novo papel global: Gestor de Projetos. Apenas adiciona o valor ao enum
-- (não é usado nesta mesma migration, então roda ok dentro da transação no PG16).
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'project_manager';
