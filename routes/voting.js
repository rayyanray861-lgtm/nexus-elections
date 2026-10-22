const express = require("express");
const pool = require("../config/database");
const asyncRoute = require("../middleware/asyncRoute");
const { requireVoter } = require("../middleware/auth");
const { currentElection } = require("../services/electionService");

const router = express.Router();

router.get("/ballot-access", asyncRoute(async (req, res) => {
  const election = await currentElection();
  if (!election || election.status !== "open") return res.status(403).json({ error: "Voting is not open." });
  if (req.session.ballotSessionId) {
    const existing = await pool.query(
      "SELECT used_at FROM ballot_sessions WHERE ballot_session_id = $1 AND election_id = $2",
      [req.session.ballotSessionId, election.election_id],
    );
    if (existing.rowCount) return res.json({ active: !existing.rows[0].used_at, submitted: Boolean(existing.rows[0].used_at) });
  }
  const created = await pool.query(
    "INSERT INTO ballot_sessions (election_id) VALUES ($1) RETURNING ballot_session_id",
    [election.election_id],
  );
  req.session.ballotSessionId = created.rows[0].ballot_session_id;
  res.json({ active: true, submitted: false });
}));

router.post("/votes", requireVoter, asyncRoute(async (req, res) => {
  const choices = req.body.choices;
  if (!Array.isArray(choices) || choices.length > 20) {
    return res.status(400).json({ error: "Submit a valid ballot." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const election = await currentElection(client);
    if (!election || election.status !== "open") throw Object.assign(new Error("Voting is not open."), { status: 403 });
    await client.query("SELECT election_id FROM elections WHERE election_id = $1 FOR SHARE", [election.election_id]);
    const ballotSession = await client.query(
      "SELECT ballot_session_id, used_at FROM ballot_sessions WHERE ballot_session_id = $1 AND election_id = $2 FOR UPDATE",
      [req.session.ballotSessionId, election.election_id],
    );
    if (!ballotSession.rowCount || ballotSession.rows[0].used_at) throw Object.assign(new Error("This browser has already submitted a ballot."), { status: 409 });
    const positions = await client.query("SELECT position_id FROM positions WHERE election_id = $1 ORDER BY position_id", [election.election_id]);
    if (choices.length !== positions.rowCount) throw Object.assign(new Error("Choose one candidate for every position."), { status: 400 });
    const submittedPositions = new Set(choices.map((choice) => Number(choice.position_id)));
    if (submittedPositions.size !== positions.rowCount || positions.rows.some((row) => !submittedPositions.has(Number(row.position_id)))) {
      throw Object.assign(new Error("The ballot must contain one choice for every position."), { status: 400 });
    }
    for (const choice of choices) {
      const candidateId = Number(choice.candidate_id);
      if (!Number.isInteger(candidateId)) throw Object.assign(new Error("Choose a valid candidate for each position."), { status: 400 });
    }
    await client.query(
      "INSERT INTO ballot_submissions (election_id, ballot_session_id) VALUES ($1, $2)",
      [election.election_id, req.session.ballotSessionId],
    );
    await client.query("UPDATE ballot_sessions SET used_at = CURRENT_TIMESTAMP WHERE ballot_session_id = $1", [req.session.ballotSessionId]);
    for (const choice of choices) {
      await client.query(
        "INSERT INTO votes (election_id, position_id, candidate_id) VALUES ($1, $2, $3)",
        [election.election_id, Number(choice.position_id), Number(choice.candidate_id)],
      );
    }
    await client.query("COMMIT");
    res.status(201).json({ message: "Your ballot has been submitted." });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") error = Object.assign(new Error("This browser has already submitted a ballot."), { status: 409 });
    throw error;
  } finally {
    client.release();
  }
}));

module.exports = router;
