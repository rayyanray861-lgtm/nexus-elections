function requireVoter(req, res, next) {
  if (!req.session.ballotSessionId) return res.status(401).json({ error: "Open the ballot first." });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) return res.status(401).json({ error: "Organizer sign-in required." });
  next();
}

module.exports = { requireAdmin, requireVoter };
