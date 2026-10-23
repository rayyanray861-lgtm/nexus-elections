const crypto = require("node:crypto");
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const pool = require("../config/database");
const asyncRoute = require("../middleware/asyncRoute");
const { sendApprovalRequest } = require("../services/emailService");

const router = express.Router();
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV !== "production",
});
const approvalLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
router.use(express.urlencoded({ extended: false, limit: "2kb" }));

router.post("/auth/register", authLimit, asyncRoute(async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (name.length < 1 || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 12 || password.length > 72) {
    return res.status(400).json({ error: "Provide a name, valid email, and password of 12–72 characters." });
  }
  if (!process.env.APP_BASE_URL) throw new Error("APP_BASE_URL is not configured.");

  const passwordHash = await bcrypt.hash(password, 12);
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const result = await pool.query(
    `INSERT INTO app_users (name, email, password_hash, status, approval_token_hash, approval_token_expires_at)
     VALUES ($1, $2, $3, 'pending', $4, CURRENT_TIMESTAMP + INTERVAL '24 hours')
     ON CONFLICT (email) DO NOTHING RETURNING user_id`,
    [name, email, passwordHash, tokenHash],
  );
  if (!result.rowCount) return res.status(409).json({ error: "An account with that email already exists." });

  const approvalUrl = new URL("/api/auth/approve", process.env.APP_BASE_URL);
  approvalUrl.searchParams.set("token", token);
  try {
    await sendApprovalRequest({ name, email, approvalUrl: approvalUrl.toString() });
  } catch (error) {
    await pool.query("DELETE FROM app_users WHERE user_id = $1 AND status = 'pending'", [result.rows[0].user_id]);
    throw error;
  }
  res.status(202).json({ message: "Registration received. An administrator must approve your account before sign-in." });
}));

router.post("/auth/login", authLimit, asyncRoute(async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const { rows } = await pool.query("SELECT user_id, password_hash, is_approved FROM app_users WHERE email = $1", [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Invalid email or password." });
  if (!user.is_approved) return res.status(403).json({ error: "Your account is awaiting administrator approval." });

  await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
  req.session.userId = user.user_id;
  res.json({ message: "Signed in." });
}));

router.post("/auth/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) return res.status(500).json({ error: "Could not sign out." });
    res.clearCookie("nexus.sid", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    res.status(204).end();
  });
});

router.get("/auth/approve", approvalLimit, asyncRoute(async (req, res) => {
  const token = String(req.query.token || "");
  if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).send("Invalid approval link.");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const result = await pool.query(
    `UPDATE app_users SET status = 'approved', is_approved = true, approval_token_hash = NULL, approval_token_expires_at = NULL, approved_at = CURRENT_TIMESTAMP
      WHERE approval_token_hash = $1 AND approval_token_expires_at > CURRENT_TIMESTAMP AND status = 'pending'
      RETURNING email`,
    [tokenHash],
  );
  if (!result.rowCount) return res.status(400).type("html").send("<!doctype html><html><head><meta charset=\"utf-8\"><title>Approval link invalid</title></head><body><h1>Approval link invalid</h1><p>This link has expired or was already used.</p></body></html>");
  res.redirect(303, `/login.html?message=${encodeURIComponent("Account approved. You can now sign in.")}`);
}));

module.exports = router;
