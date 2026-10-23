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
const authRoutes = require("./routes/auth");
const { requireApproved } = require("./middleware/checkApproval");

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

app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/login", (_req, res) => res.sendFile(path.join(publicDir, "login.html")));
app.get("/nexus-election-site.html", requireApproved, (_req, res) => res.sendFile(path.join(publicDir, "nexus-election-site.html")));
app.get("/ballot", requireApproved, (_req, res) => res.sendFile(path.join(publicDir, "nexus-ballot-design.html")));
app.get("/nexus-ballot-design.html", requireApproved, (_req, res) => res.sendFile(path.join(publicDir, "nexus-ballot-design.html")));
app.get("/nexus-icon.jpg", (_req, res) => res.sendFile(path.join(publicDir, "nexus-icon.jpg")));
app.use(express.static(publicDir));

app.use("/api", authRoutes);
app.use("/api", electionRoutes);
app.use("/api", candidateRoutes);
app.use("/api/ballot-access", requireApproved);
app.use("/api/votes", requireApproved);
app.use("/api", votingRoutes);
app.use("/api", adminRoutes);

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({ error: error.status ? error.message : "Something went wrong. Please try again." });
});

let httpServer;

function reportProcessError(label, error) {
  console.error(`${label}:`, error?.stack || error);
}

process.on("uncaughtException", (error) => {
  reportProcessError("Uncaught exception", error);
  if (httpServer?.listening) {
    httpServer.close(() => {
      process.exitCode = 1;
    });
  } else {
    process.exitCode = 1;
  }
});

process.on("unhandledRejection", (reason) => {
  reportProcessError("Unhandled promise rejection", reason);
});

async function startServer() {
  try {
    httpServer = await new Promise((resolve, reject) => {
      const instance = app.listen(port);
      instance.once("listening", () => resolve(instance));
      instance.once("error", reject);
    });

    httpServer.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(`Port ${port} is already in use. Stop the other server or set PORT to a different value.`);
      }
      reportProcessError("HTTP server error", error);
    });

    console.log(`Nexus elections is running at http://localhost:${port}`);
  } catch (error) {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${port} is already in use. Stop the other server or set PORT to a different value.`);
    }
    reportProcessError("Server startup failed", error);
    process.exitCode = 1;
  }
}

if (require.main === module) startServer();

module.exports = app;
