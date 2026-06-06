-- Clientes e fornecedores restritos: quando admin_only = true, só admins veem.
ALTER TABLE clients   ADD COLUMN IF NOT EXISTS admin_only boolean NOT NULL DEFAULT false;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS admin_only boolean NOT NULL DEFAULT false;
