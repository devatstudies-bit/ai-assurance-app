-- =============================================================================
-- 00_create_database.sql
-- Creates the AI Assurance database and its login roles.
--
-- Run ONCE, as a superuser (or a role with CREATEDB and CREATEROLE), while
-- connected to the default "postgres" database:
--
--   psql -h <host> -U postgres -d postgres \
--        -v app_password='<strong password>' \
--        -v reporting_password='<strong password>' \
--        -f backend/database/sql/00_create_database.sql
--
-- Passwords are passed as psql variables and quoted safely with format(%L);
-- they never appear in this file. Store them in Key Vault.
--
-- On Azure Database for PostgreSQL, create the database in the portal or with
-- the CLI instead, and run only the role section below as the admin user.
-- =============================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Login roles
--   assurance_app        The API's own login. Owns the schema and reads and
--                        writes every table. Used in ASSURANCE_DATABASE_URL.
--   assurance_reporting  Read-only login for the AI Metrics Dashboard and
--                        auditors' ad-hoc queries. Gets SELECT on the
--                        reporting views only (see 12_roles_and_grants.sql).
-- ---------------------------------------------------------------------------
SELECT format('CREATE ROLE assurance_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'assurance_app') \gexec

SELECT format('CREATE ROLE assurance_reporting LOGIN PASSWORD %L', :'reporting_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'assurance_reporting') \gexec

-- Default schema for both roles, so connection URLs need no search_path option.
-- (Set here because only a superuser or CREATEROLE role may change another role's settings.)
ALTER ROLE assurance_app       SET search_path = assurance, public;
ALTER ROLE assurance_reporting SET search_path = assurance, public;

-- ---------------------------------------------------------------------------
-- Database
--   UTF8, owned by the application role. CREATE DATABASE cannot run inside a
--   transaction or a DO block, hence \gexec.
-- ---------------------------------------------------------------------------
SELECT 'CREATE DATABASE assurance OWNER assurance_app ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'assurance') \gexec

-- Nobody but the owner may create objects in the public schema.
\connect assurance
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
