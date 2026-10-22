const express = require("express");
const { rateLimit } = require("express-rate-limit");
const pool = require("../config/database");
const asyncRoute = require("../middleware/asyncRoute");
const { requireAdmin } = require("../middleware/auth");
const { currentElection, ensureDefaultPositions } = require("../services/electionService");

const router = express.Router();

const loginLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many login attempts. Please wait 1 minute, then try again." });
  },
});

router.post("/admin/logout", (req, res) => {
  req.session.destroy(() => res.status(204).end());
});

router.post("/admin/login", loginLimit, asyncRoute(async (req, res) => {
  if (String(req.body.password || "") !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Organizer password is incorrect." });
  }
  await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
  req.session.isAdmin = true;
  res.json({ message: "Organizer signed in." });
}));

router.post("/admin/close-election", requireAdmin, asyncRoute(async (_req, res) => {
  const result = await pool.query(
    "UPDATE elections SET status = 'closed', ends_at = COALESCE(ends_at, CURRENT_TIMESTAMP) WHERE election_id = (SELECT election_id FROM elections ORDER BY election_id DESC LIMIT 1) AND status <> 'closed' RETURNING election_id",
  );
  if (!result.rowCount) return res.status(409).json({ error: "There is no open election to close." });
  res.json({ message: "Voting is closed. Results are now available." });
}));

router.post("/admin/reset-election", requireAdmin, asyncRoute(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const election = await currentElection(client);
    if (!election) throw Object.assign(new Error("Election setup is not complete."), { status: 404 });

    await client.query("SELECT election_id FROM elections WHERE election_id = $1 FOR UPDATE", [election.election_id]);
    await client.query("DELETE FROM votes WHERE election_id = $1", [election.election_id]);
    await client.query("DELETE FROM ballot_submissions WHERE election_id = $1", [election.election_id]);
    await client.query("DELETE FROM ballot_sessions WHERE election_id = $1", [election.election_id]);
    await client.query("DELETE FROM candidates WHERE election_id = $1", [election.election_id]);

    await ensureDefaultPositions(client, election.election_id);
    await client.query(
      "UPDATE elections SET status = 'open', starts_at = CURRENT_TIMESTAMP, ends_at = NULL WHERE election_id = $1",
      [election.election_id],
    );
    const positions = await client.query(
      `SELECT p.position_id, p.name, p.reports_to_position_id,
              parent.name AS reports_to,
              COALESCE(json_agg(json_build_object('candidate_id', c.candidate_id, 'name', c.name, 'statement', c.statement))
                FILTER (WHERE c.candidate_id IS NOT NULL), '[]'::json) AS candidates
         FROM positions p
         LEFT JOIN positions parent ON parent.position_id = p.reports_to_position_id
         LEFT JOIN candidates c ON c.position_id = p.position_id AND c.election_id = p.election_id
        WHERE p.election_id = $1
        GROUP BY p.position_id, parent.name
        ORDER BY p.position_id`,
      [election.election_id],
    );
    await client.query("COMMIT");
    delete req.session.ballotSessionId;
    res.json({
      message: "Election reset. Votes and candidates were cleared; positions are ready for new candidate registrations.",
      election: { ...election, status: "open" },
      positions: positions.rows,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

module.exports = router;
