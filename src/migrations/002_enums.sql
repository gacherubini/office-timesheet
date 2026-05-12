DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'employee', 'administrative_intern');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE project_status AS ENUM ('active', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE time_entry_status AS ENUM ('running', 'paused', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
