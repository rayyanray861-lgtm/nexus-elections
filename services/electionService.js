const pool = require("../config/database");

async function currentElection(client = pool) {
  const result = await client.query(
    "SELECT election_id, name, description, status, starts_at, ends_at FROM elections ORDER BY election_id DESC LIMIT 1",
  );
  return result.rows[0] || null;
}

async function ensureDefaultPositions(client, electionId) {
  const existing = await client.query(
    "SELECT position_id FROM positions WHERE election_id = $1 LIMIT 1",
    [electionId],
  );
  if (existing.rowCount) return;

  for (const name of ["President", "Vice President", "Technical Manager", "Workshop Manager", "Event Manager"]) {
    await client.query(
      "INSERT INTO positions (election_id, name) VALUES ($1, $2) ON CONFLICT (election_id, name) DO NOTHING",
      [electionId, name],
    );
  }
  for (const [managerName, leadName] of [
    ["Technical Manager", "Technical Lead"],
    ["Workshop Manager", "Workshop Lead"],
    ["Event Manager", "Event Lead"],
  ]) {
    await client.query(
      `INSERT INTO positions (election_id, name, reports_to_position_id)
       SELECT $1, $2, position_id FROM positions
        WHERE election_id = $1 AND name = $3
       ON CONFLICT (election_id, name) DO NOTHING`,
      [electionId, leadName, managerName],
    );
  }
}

module.exports = { currentElection, ensureDefaultPositions };
