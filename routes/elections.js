const express = require("express");
const pool = require("../config/database");
const asyncRoute = require("../middleware/asyncRoute");
const { currentElection, ensureDefaultPositions } = require("../services/electionService");

const router = express.Router();

router.get("/election", asyncRoute(async (_req, res) => {
  const election = await currentElection();
  if (!election) return res.status(404).json({ error: "Election setup is not complete." });
  await ensureDefaultPositions(pool, election.election_id);
  const positions = await pool.query(
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
  res.json({ election, positions: positions.rows });
}));

router.get("/results", asyncRoute(async (_req, res) => {
  const election = await currentElection();
  if (!election || election.status !== "closed") {
    return res.status(403).json({ error: "Results will be available after the organizer closes voting." });
  }
  const result = await pool.query(
    `SELECT p.position_id, p.name AS position,
            c.candidate_id, c.name AS candidate, COUNT(v.vote_id)::int AS votes
       FROM positions p
       LEFT JOIN candidates c ON c.election_id = p.election_id AND c.position_id = p.position_id
       LEFT JOIN votes v ON v.election_id = p.election_id AND v.position_id = p.position_id AND v.candidate_id = c.candidate_id
      WHERE p.election_id = $1
      GROUP BY p.position_id, p.name, c.candidate_id, c.name
      ORDER BY p.position_id, votes DESC, c.name`,
    [election.election_id],
  );
  res.json({ election, results: result.rows });
}));

module.exports = router;
