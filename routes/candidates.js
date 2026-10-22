const express = require("express");
const pool = require("../config/database");
const asyncRoute = require("../middleware/asyncRoute");
const { currentElection } = require("../services/electionService");

const router = express.Router();

router.post("/candidates", asyncRoute(async (req, res) => {
  const name = String(req.body.name || "").trim();
  const positionId = Number(req.body.position_id);
  const statement = String(req.body.statement || "").trim();
  if (name.length < 2 || name.length > 100 || !Number.isInteger(positionId)) {
    return res.status(400).json({ error: "Enter your name and choose a position." });
  }
  const election = await currentElection();
  if (!election || election.status !== "open") return res.status(403).json({ error: "Candidate registration is closed." });
  const result = await pool.query(
    `INSERT INTO candidates (election_id, position_id, name, statement)
     SELECT $1, p.position_id, $3, $4 FROM positions p
      WHERE p.election_id = $1 AND p.position_id = $2
     RETURNING candidate_id, name, position_id`,
    [election.election_id, positionId, name, statement.slice(0, 500)],
  );
  if (!result.rowCount) return res.status(400).json({ error: "Choose a valid election position." });
  res.status(201).json({ candidate: result.rows[0] });
}));

module.exports = router;
