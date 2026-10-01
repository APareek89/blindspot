-- Apply once after the eight original Drizzle migrations, under an operator lock.
-- Fresh deployment only: existing personal/invite projects need an explicit ownership migration.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM blindspot.projects) THEN RAISE EXCEPTION 'Fresh portfolio database required'; END IF;
END $$;
CREATE TABLE blindspot.users (
 id text PRIMARY KEY CHECK(id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
 email text NOT NULL UNIQUE CHECK(email=lower(email)), password_hash text NOT NULL,
 disabled boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE blindspot.sessions (
 id uuid PRIMARY KEY, owner_id text NOT NULL REFERENCES blindspot.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, revoked_at timestamptz
);
CREATE INDEX sessions_owner_idx ON blindspot.sessions(owner_id);
CREATE TABLE blindspot.auth_rates(key text PRIMARY KEY,window_start timestamptz NOT NULL,count integer NOT NULL);
CREATE TABLE blindspot.bridge_nonces(nonce text PRIMARY KEY,expires_at timestamptz NOT NULL);
CREATE TABLE blindspot.example_runs(project_id uuid PRIMARY KEY REFERENCES blindspot.projects(id),owner_id text NOT NULL REFERENCES blindspot.users(id),workflow_id uuid NOT NULL,route_name text,status text NOT NULL CHECK(status IN ('running','complete','failed')),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE blindspot.storage_admissions(id uuid PRIMARY KEY,project_id uuid NOT NULL REFERENCES blindspot.projects(id),bytes bigint NOT NULL CHECK(bytes>=0),expires_at timestamptz NOT NULL);
ALTER TABLE blindspot.projects ADD CONSTRAINT projects_owner_fk FOREIGN KEY(user_id) REFERENCES blindspot.users(id);
ALTER TABLE blindspot.api_keys ADD COLUMN revoked_at timestamptz;
ALTER TABLE blindspot.api_keys ADD COLUMN expires_at timestamptz;
ALTER TABLE blindspot.api_keys ADD COLUMN scopes text[] NOT NULL DEFAULT ARRAY['completion','telemetry','feedback'];
ALTER TABLE blindspot.traces ADD COLUMN project_id uuid NOT NULL REFERENCES blindspot.projects(id);
CREATE INDEX traces_project_created_idx ON blindspot.traces(project_id,created_at);
ALTER TABLE blindspot.workflows ADD COLUMN example_kind text CHECK(example_kind IS NULL OR example_kind='prepared');
ALTER TABLE blindspot.routes ADD COLUMN example_kind text CHECK(example_kind IS NULL OR example_kind='prepared');
CREATE TABLE blindspot.usage (
 id uuid PRIMARY KEY,owner_id text NOT NULL REFERENCES blindspot.users(id),project_id uuid NOT NULL REFERENCES blindspot.projects(id),
 auth_kind text NOT NULL CHECK(auth_kind IN ('session','sdk')),auth_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('chat','judge','golden')),model_ref text NOT NULL,shared boolean NOT NULL,
 reserved_usd numeric NOT NULL CHECK(reserved_usd>=0),actual_usd numeric CHECK(actual_usd>=0),pricing jsonb NOT NULL,
 status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','dispatched','complete','uncertain','released')),
 input_tokens integer,output_tokens integer,cached_input_tokens integer,
 created_at timestamptz NOT NULL DEFAULT now(),dispatched_at timestamptz,settled_at timestamptz
);
CREATE INDEX usage_owner_idx ON blindspot.usage(owner_id,created_at);
CREATE TABLE blindspot.portfolio_schema(version integer PRIMARY KEY,installed_at timestamptz NOT NULL DEFAULT now());
INSERT INTO blindspot.portfolio_schema(version) VALUES(1);
