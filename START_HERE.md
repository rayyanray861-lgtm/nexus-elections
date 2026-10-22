# Nexus Coding Club Elections

Express serves the election website and connects it to PostgreSQL. Keep the Node.js server running while using the site at `http://localhost:3000`.

## Project layout

- `server.js` — starts Express and installs shared middleware
- `config/database.js` — creates the shared PostgreSQL connection pool
- `routes/` — API handlers grouped by elections, candidates, voting, and admin actions
- `middleware/` — reusable async error forwarding and voter/organizer authorization
- `services/electionService.js` — shared election lookup and default-position setup
- `public/` — the active election website, ballot page, design pages, and image asset
- `database/` — PostgreSQL database creation, schema, and application setup scripts
- `package.json` and `package-lock.json` — Node.js scripts and dependencies
- `.env` — private local connection and password settings; do not commit this file

## Run with local PostgreSQL

1. Install Node.js and PostgreSQL, then create the database by running this in PowerShell from the project root:

   ```powershell
   psql -U postgres -d postgres -f database/create_nexus_elections.sql
   ```

   This creates the `nexus_elections` database used by the application. `create_nexus_election.sql` creates a differently named, singular database and is retained as an alternate setup script.

2. Initialize the database schema and election tables:

   ```powershell
   psql -U postgres -d nexus_elections -f database/nexus_elections_schema.sql
   psql -U postgres -d nexus_elections -f database/election_app_setup.sql
   ```

3. Configure the existing `.env` file in the project root with your PostgreSQL connection values, `SESSION_SECRET`, and `ADMIN_PASSWORD`. Do not replace an existing `.env` with `.env.example`; edit only the values you need to change.

4. Install dependencies if needed and start the server:

   ```powershell
   npm.cmd install
   npm.cmd start
   ```

5. Visit `http://localhost:3000`.

## Run with Supabase PostgreSQL

In the Supabase dashboard, open **Connect**, choose **Session pooler**, and put its connection URI in the `DATABASE_URL` setting in the project root `.env`. Keep the URI private. Then run `database/nexus_elections_schema.sql` and `database/election_app_setup.sql`, in that order, in the Supabase SQL Editor. Restart the server with `npm.cmd start` and visit `http://localhost:3000`.

The app uses the plural database name `nexus_elections` in the local PostgreSQL setup. For Supabase connection details, see the [Supabase database connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).
