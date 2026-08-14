-- Custom SQL migration file, put your code below! ----
-- Fixes: infra/terraform/modules/vault-config/main.tf's creation_statements
-- re-run "GRANT ... ON ALL TABLES IN SCHEMA public" every time Vault mints a
-- fresh, ephemeral Postgres role — but that only covers whatever tables
-- exist at that exact moment. A table a later migration adds is invisible
-- to any credential that was already minted and cached (lib/vault.ts caches
-- for ~80% of a 5-minute lease) before the migration ran, until that
-- credential's lease naturally rotates: a real, silent
-- permission-denied-on-the-new-table window, and the exact gap this
-- migration closes.
--
-- meridian_app_readwrite is a static, standing role — never logged into
-- directly, never dropped — that Vault's ephemeral per-lease roles join
-- (see the updated creation_statements in vault-config/main.tf) instead of
-- being granted table privileges directly. ALTER DEFAULT PRIVILEGES below
-- makes every table this migration's own role (the RDS master role
-- db:migrate always runs as — see scripts/migrate.ts) creates from now on
-- automatically grant these privileges to meridian_app_readwrite, with no
-- re-grant step required ever again, no matter which future migration adds
-- the table.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'meridian_app_readwrite') THEN
    CREATE ROLE meridian_app_readwrite NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO meridian_app_readwrite;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO meridian_app_readwrite;
