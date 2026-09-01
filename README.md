# Tutoring Schedule

A simple static web app for tracking tutoring lessons, pay, and what's been paid.

- **Default Week** tab: a template week (no dates, no paid checkbox) you edit once.
- **This Week** tab: the live, date-based week. The first time you visit a new week, it's seeded from whatever is currently in Default Week; after that it's independent.
- **Earnings**: weekly and monthly totals, split into paid / unpaid.

Data is stored in a [Supabase](https://supabase.com) Postgres database (free tier is plenty), so it follows you across any browser or device once it's set up. See **Database setup** below before deploying.

## Files

- `index.html` — page structure
- `style.css` — styling
- `config.js` — your Supabase URL + key go here
- `script.js` — app logic + storage
- `supabase-setup.sql` — SQL to create the table (run once)

## Database setup (do this first)

1. Go to [supabase.com](https://supabase.com), sign up/sign in, and create a new project (pick any name/region; the free tier is enough).
2. Once it's ready, open the **SQL Editor** in the left sidebar, click **New query**, paste in the contents of `supabase-setup.sql` from this folder, and click **Run**. This creates the table the app reads and writes to.
3. Go to **Settings → API**. You'll need two values:
   - **Project URL**
   - **anon public** key (NOT the `service_role` key — that one should never go in frontend code)
4. Open `config.js` in this folder and paste them in:

```js
const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOi...";
```

Save the file. That's it — the app will now read/write to your database.

> **Heads up on security:** this app has no login system, so anyone with your Supabase URL and anon key (both are visible in the deployed site's source code) can read or edit your data. That's a reasonable tradeoff for a personal tool nobody else knows the address of, but don't share the deployed URL widely. If you'd ever want real access control, that means adding Supabase Auth (a login screen) — happy to help with that later if you need it.

## Deploying to Vercel

### Option A — quickest (no git required)

1. Go to [vercel.com](https://vercel.com) and sign in (you can use a GitHub, GitLab, or email account).
2. From the dashboard, click **Add New… → Project**.
3. Choose **"Deploy without Git"** / drag-and-drop, and drop this whole folder in.
4. Vercel auto-detects it as a static site — click **Deploy**. You'll get a live URL in under a minute.

This works fine, but future edits mean re-uploading the folder each time.

### Option B — with Git + GitHub (recommended, gives you version history and auto-redeploys)

**1. Initialize a git repo locally**

Open a terminal in this folder and run:

```bash
git init
git add .
git commit -m "Initial commit: tutoring schedule app"
```

**2. Create a GitHub repo and push**

- Go to [github.com/new](https://github.com/new) and create a new repository (e.g. `tutoring-schedule`). Don't initialize it with a README (you already have one).
- Then, back in your terminal:

```bash
git remote add origin https://github.com/YOUR_USERNAME/tutoring-schedule.git
git branch -M main
git push -u origin main
```

**3. Import into Vercel**

- In the Vercel dashboard, click **Add New… → Project**.
- Choose **Import Git Repository**, authorize GitHub if prompted, and select your `tutoring-schedule` repo.
- Framework preset: **Other** (it's a plain static site — no build step needed).
- Click **Deploy**.

From now on, any `git push` to `main` automatically redeploys the live site.

### Optional: Vercel CLI instead of the dashboard

```bash
npm install -g vercel
cd tutoring-schedule-app
vercel
```

Follow the prompts (log in, confirm project name, confirm it's a static project). Running `vercel --prod` later pushes a production deploy.

## A note on data

Your lesson data lives in your Supabase project's Postgres database, so it's the same data no matter which browser or device you open the site on. If you ever want to inspect or manually edit it, Supabase's dashboard has a **Table Editor** where you can browse the `kv_store` table directly.

## Local testing before you deploy

Because the app now loads `config.js` and talks to Supabase over the network, opening `index.html` directly as a `file://` URL may be blocked by the browser. Easiest fix: serve the folder locally, e.g.

```bash
cd tutoring-schedule-app
python3 -m http.server 8000
```

then visit `http://localhost:8000`.

