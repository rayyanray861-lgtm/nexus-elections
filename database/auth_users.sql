-- Run once against the same database configured for the Express app.
CREATE TABLE IF NOT EXISTS app_users (
    user_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    is_approved BOOLEAN NOT NULL DEFAULT false,
    approval_token_hash TEXT UNIQUE,
    approval_token_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMPTZ
);

ALTER TABLE app_users
    ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT false;

UPDATE app_users SET is_approved = true WHERE status = 'approved' AND is_approved = false;
