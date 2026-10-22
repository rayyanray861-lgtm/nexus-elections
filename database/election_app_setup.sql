-- Run once against the nexus_elections database after nexus_elections_schema.sql.
ALTER TABLE voters
    ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- Replace the old prototype vote table only when it is still empty.
-- This keeps a later rerun from erasing real vote data.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'votes' AND column_name = 'voter_id'
    ) THEN
        IF EXISTS (SELECT 1 FROM votes LIMIT 1) THEN
            RAISE EXCEPTION 'The old votes table already has data. Stop and contact the site organizer before migrating.';
        END IF;
        DROP TABLE votes;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS ballot_submissions (
    submission_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    election_id BIGINT NOT NULL REFERENCES elections(election_id) ON DELETE CASCADE,
    voter_id BIGINT NOT NULL REFERENCES voters(voter_id) ON DELETE CASCADE,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (election_id, voter_id)
);

-- The public ballot uses a browser session, so it does not require a voter account.
CREATE TABLE IF NOT EXISTS ballot_sessions (
    ballot_session_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    election_id BIGINT NOT NULL REFERENCES elections(election_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMPTZ
);

ALTER TABLE ballot_submissions
    ALTER COLUMN voter_id DROP NOT NULL;

ALTER TABLE ballot_submissions
    ADD COLUMN IF NOT EXISTS ballot_session_id BIGINT
        REFERENCES ballot_sessions(ballot_session_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS ballot_submissions_session_once
    ON ballot_submissions (election_id, ballot_session_id)
    WHERE ballot_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS votes (
    vote_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    election_id BIGINT NOT NULL,
    position_id BIGINT NOT NULL,
    candidate_id BIGINT NOT NULL,
    FOREIGN KEY (election_id, position_id, candidate_id)
        REFERENCES candidates(election_id, position_id, candidate_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS elections_name_unique
    ON elections (name);

INSERT INTO elections (name, description, status)
VALUES ('Nexus Coding Club Elections 2026', 'Nexus Coding Club leadership elections', 'open')
ON CONFLICT (name) DO NOTHING;

INSERT INTO positions (election_id, name)
SELECT e.election_id, p.name
FROM elections e
CROSS JOIN (VALUES
    ('President'),
    ('Vice President'),
    ('Technical Manager'),
    ('Workshop Manager'),
    ('Event Manager')
) AS p(name)
WHERE e.name = 'Nexus Coding Club Elections 2026'
  AND NOT EXISTS (
      SELECT 1 FROM positions old
      WHERE old.election_id = e.election_id AND old.name = p.name
  );

INSERT INTO positions (election_id, name, reports_to_position_id)
SELECT e.election_id, p.lead_name, manager.position_id
FROM elections e
CROSS JOIN (VALUES
    ('Technical Manager', 'Technical Lead'),
    ('Workshop Manager', 'Workshop Lead'),
    ('Event Manager', 'Event Lead')
) AS p(manager_name, lead_name)
JOIN positions manager
  ON manager.election_id = e.election_id AND manager.name = p.manager_name
WHERE e.name = 'Nexus Coding Club Elections 2026'
  AND NOT EXISTS (
      SELECT 1 FROM positions old
      WHERE old.election_id = e.election_id AND old.name = p.lead_name
  );
