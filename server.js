require("dotenv").config();

const express = require("express");
const session = require("express-session");
const connectPgSimple = require("connect-pg-simple")(session);
const helmet = require("helmet");
const path = require("node:path");

const requiredEnv = [
  ...(process.env.DATABASE_URL ? [] : ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"]),
  "SESSION_SECRET",
  "ADMIN_PASSWORD",
];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length) {
  console.error(`Missing settings in .env: ${missingEnv.join(", ")}`);
  process.exit(1);
}

// Import after dotenv and configuration validation so the pool sees loaded settings.
const pool = require("./config/database");
const electionRoutes = require("./routes/elections");
const candidateRoutes = require("./routes/candidates");
const votingRoutes = require("./routes/voting");
const adminRoutes = require("./routes/admin");

const app = express();
const port = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, "public");

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  next();
});
app.use(express.json({ limit: "20kb" }));
app.use(
  session({
    store: new connectPgSimple({ pool, createTableIfMissing: true }),
    name: "nexus.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 8 * 60 * 60 * 1000,
    },
  }),
);

app.get("/", (_req, res) => res.sendFile(path.join(publicDir, "nexus-election-site.html")));
app.get("/ballot", (_req, res) => res.sendFile(path.join(publicDir, "nexus-ballot-design.html")));
app.get("/nexus-icon.jpg", (_req, res) => res.sendFile(path.join(publicDir, "nexus-icon.jpg")));
app.use(express.static(publicDir));

app.use("/api", electionRoutes);
app.use("/api", candidateRoutes);
app.use("/api", votingRoutes);
app.use("/api", adminRoutes);

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({ error: error.status ? error.message : "Something went wrong. Please try again." });
});

if (require.main === module) {
  app.listen(port, () => console.log(`Nexus elections is running at http://localhost:${port}`));
}

module.exports = app;
