# Automation Hub — Project Tracker
## Stack: Vercel (frontend + API) + Supabase (database)

---

## File structure

```
vercel_tracker/
├── public/
│   └── index.html          ← SPA frontend
├── api/
│   ├── _db.js              ← Supabase client (shared)
│   ├── projects.js         ← GET /api/projects  POST /api/projects
│   ├── projects/
│   │   ├── [id].js         ← GET/PATCH/DELETE /api/projects/:id
│   │   └── summary.js      ← GET /api/projects/summary
│   ├── health.js           ← GET /api/health
│   └── seed.js             ← GET /api/seed  (one-time data load)
├── supabase_schema.sql     ← Run in Supabase SQL editor
├── vercel.json             ← Vercel routing config
├── package.json
└── README.md
```

---

## Step 1 — Supabase setup (5 minutes)

1. Go to **https://supabase.com** → New project
2. Choose a name (e.g. `automation-hub`) and a strong DB password
3. Once provisioned, go to **SQL Editor → New Query**
4. Paste the contents of `supabase_schema.sql` and click **Run**
5. Go to **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** secret key → `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 2 — Deploy to Vercel (3 minutes)

### Option A: Vercel CLI
```bash
npm i -g vercel
cd vercel_tracker
vercel
# Follow prompts — it will detect vercel.json automatically
```

### Option B: GitHub + Vercel Dashboard
1. Push this folder to a GitHub repo
2. Go to **https://vercel.com** → New Project → Import repo
3. Framework: **Other** (no framework)
4. Root directory: leave as-is (or set to `vercel_tracker/`)
5. Click **Deploy**

---

## Step 3 — Set environment variables in Vercel

In the Vercel dashboard → Project → **Settings → Environment Variables**, add:

| Name | Value |
|------|-------|
| `SUPABASE_URL` | `https://xxxxxxxxxxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` (service_role key) |
| `SEED_SECRET` | Any random string, e.g. `my-secret-seed-token-2026` |

Then **Redeploy** (Settings → Deployments → Redeploy).

---

## Step 4 — Seed the database (one time only)

```bash
curl https://<your-vercel-url>/api/seed \
     -H "x-seed-token: <your-SEED_SECRET>"
```

Expected response:
```json
{ "message": "Seeded 62 projects", "count": 62 }
```

---

## Step 5 — Set custom domain (optional)

To use `https://enterprise/project_tracker`:

1. Vercel Dashboard → Project → **Settings → Domains**
2. Add `enterprise` as a domain
3. Configure your DNS to point to Vercel's nameservers (or add a CNAME)
4. In `public/index.html`, the `API` constant is `''` (same-origin), so no changes needed.

---

## API endpoints

Base URL: `https://<your-vercel-url>/api`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/projects` | List all. Params: `status`, `rag`, `mc`, `category`, `priority`, `q` |
| GET | `/projects/summary` | Metrics + risk lists |
| GET | `/projects/:id` | Single project |
| POST | `/projects` | Create project |
| PATCH | `/projects/:id` | Update fields |
| DELETE | `/projects/:id` | Remove project |
| GET | `/health` | Health + Supabase status |
| GET | `/seed` | Seed all 62 projects (requires `x-seed-token` header) |

### Examples
```bash
# Filter blocked red projects
curl "https://<url>/api/projects?status=Blocked&rag=R"

# Update a project
curl -X PATCH "https://<url>/api/projects/5" \
  -H "Content-Type: application/json" \
  -d '{"status":"Live","rag":"G","blocker":""}'

# Delete a project
curl -X DELETE "https://<url>/api/projects/5"

# Health check
curl "https://<url>/api/health"
```

---

## Local development

```bash
npm install
# Create .env.local:
echo "SUPABASE_URL=https://xxx.supabase.co" >> .env.local
echo "SUPABASE_SERVICE_ROLE_KEY=eyJ..." >> .env.local
echo "SEED_SECRET=dev-secret" >> .env.local

vercel dev
# Visit http://localhost:3000
```
