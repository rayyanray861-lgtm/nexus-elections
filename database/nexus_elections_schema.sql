-- Run this file after connecting to the nexus_elections database.

CREATE TABLE elections (
    election_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'open', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE positions (
    position_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    election_id BIGINT NOT NULL REFERENCES elections(election_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    reports_to_position_id BIGINT,
    UNIQUE (election_id, position_id),
    UNIQUE (election_id, name),
    FOREIGN KEY (election_id, reports_to_position_id)
        REFERENCES positions(election_id, position_id)
);

CREATE TABLE voters (
    voter_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE eligible_voters (
    election_id BIGINT NOT NULL REFERENCES elections(election_id) ON DELETE CASCADE,
    voter_id BIGINT NOT NULL REFERENCES voters(voter_id) ON DELETE CASCADE,
    PRIMARY KEY (election_id, voter_id)
);

CREATE TABLE candidates (
    candidate_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    election_id BIGINT NOT NULL,
    position_id BIGINT NOT NULL,
    name TEXT NOT NULL,
    statement TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (election_id, position_id, candidate_id),
    FOREIGN KEY (election_id, position_id)
        REFERENCES positions(election_id, position_id) ON DELETE CASCADE
);

CREATE TABLE votes (
    vote_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    election_id BIGINT NOT NULL,
    position_id BIGINT NOT NULL,
    voter_id BIGINT NOT NULL,
    candidate_id BIGINT NOT NULL,
    cast_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (election_id, position_id, voter_id),
    FOREIGN KEY (election_id, voter_id)
        REFERENCES eligible_voters(election_id, voter_id) ON DELETE CASCADE,
    FOREIGN KEY (election_id, position_id, candidate_id)
        REFERENCES candidates(election_id, position_id, candidate_id) ON DELETE CASCADE
);
