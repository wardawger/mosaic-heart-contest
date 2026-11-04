# Mosaic Heart

A flat line-drawing heart (drawn with three.js), covered in black. Each of its 17 sections peels away to reveal its color when a donation is recorded. Any number of teams can each run their own heart with its own link; the home page is a leaderboard of all of them. Data lives in Supabase; the site is static and deploys to Netlify.

## Pages
- `/` leaderboard of every team heart (most raised first), with a "Create your team's heart" button.
- `/h/<link-name>` a team's heart, the link teams share with donors.
- `/admin` team admin: sign in or create an account, see your hearts and their share links, create a heart, manage one (`/admin?heart=<link-name>`).

## Setup
1. **Supabase**: create a project, then run `supabase/schema.sql` in the SQL Editor (role `postgres`). It is safe to run again, and it upgrades the earlier single-heart setup (existing donations move into a heart at `/h/jax-healing-hearts`, owned by the oldest user account).
2. **Access code** teams need to create a heart (keep it private; change it any time):
   `update private.settings set value = 'your-code' where key = 'access_code';`
3. **Auth**: Authentication > Sign In / Providers: turn **on** "Allow new users to sign up" so teams can create accounts. Authentication > URL Configuration: set *Site URL* to your Netlify address and add `https://<your-site>/admin` to *Redirect URLs*, so email confirmation links come back to the admin page.
4. **Env vars** (`.env` locally, Netlify > Site configuration > Environment variables): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (see `.env.example`). The anon key is safe to expose; row-level security lets each team change only its own heart, and only the database function that checks the access code can create hearts.
5. **Netlify**: connect the repo. `netlify.toml` sets the build and the `/h/*` and `/admin` routes.

## Local dev
`npm install && npm run dev`. Without Supabase, open `/?demo` for a sample leaderboard and `/h/sample-team?demo` (or `?demo=all` for a fully revealed heart).

## Editing the heart
The heart is the flat line drawing in `design/heart-reference.png`. `scripts/trace_heart.py` traces it into `src/heart-paths.json` (one set of strokes per section, by color), which `src/heart.js` draws with three.js. To change the artwork, replace the PNG (keep one color per section, update `COLORS` in the script and the matching colors in `src/sections.js`), then run:

```
pip install numpy scipy scikit-image pillow
python scripts/trace_heart.py
```

`src/sections.js` holds each section's name, list price and color. Section ids are the keys stored in the database.
