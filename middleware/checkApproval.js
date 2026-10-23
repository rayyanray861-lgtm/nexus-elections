const pool = require("../config/database");

async function requireApproved(req, res, next) {
  const redirectToLogin = () => res.redirect(302, `/login.html?message=${encodeURIComponent("Sign in with an administrator-approved account to continue.")}`);
  if (!req.session.userId) return redirectToLogin();
  try {
    const { rows } = await pool.query("SELECT is_approved FROM app_users WHERE user_id = $1", [req.session.userId]);
    if (!rows.length || !rows[0].is_approved) {
      delete req.session.userId;
      return redirectToLogin();
    }
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { requireApproved };
