# Setup on Windows (step by step)

1. Install **Node.js 22 LTS** from https://nodejs.org (tick "Add to PATH"). Open a *new* PowerShell: `node -v`.
2. Database, pick one:
   - **Supabase** (no install): create a project → **Connect** → copy the **Session pooler** URI.
   - **Local**: install PostgreSQL from https://www.postgresql.org/download/windows/ and in **StackBuilder** tick *Spatial Extensions → PostGIS*. Then in *SQL Shell (psql)*: `create database queless;`
3. Unzip `queless.zip`, e.g. to `C:\projects\queless`.
4. Backend (PowerShell window #1):
   ```powershell
   cd C:\projects\queless\server
   copy .env.example .env
   notepad .env        # set DATABASE_URL and SESSION_SECRET, save
   npm install
   npm run db:setup
   npm run dev
   ```
   Open http://localhost:4000/health. You should see `{"ok":true,...}`.
   To make a SESSION_SECRET: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
5. Frontend (PowerShell window #2):
   ```powershell
   cd C:\projects\queless\web
   npm install
   npm run dev
   ```
   Open http://localhost:5173 and log in with `customer@queless.dev` / `Queless@123`.
6. Before a demo: `cd server; npm run demo:reset`.

Common issues
- `npm : running scripts is disabled` → PowerShell as admin once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
- `extension "postgis" is not available` → install PostGIS via StackBuilder (step 2).
- Local Postgres URL format: `postgres://postgres:YOURPASSWORD@localhost:5432/queless`
- `database/tests/engine_tests.sh` is a bash script: run it in Git Bash or WSL with `psql` installed.
