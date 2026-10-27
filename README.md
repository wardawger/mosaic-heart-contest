# Mosaic Heart

3D anatomical heart (three.js) covered in black. Each of the 17 sections peels away to reveal its color when the admin records a donation. Donations live in Supabase; the site is static and deploys to Netlify.

## Setup
1. **Supabase**: create a project, run `supabase/schema.sql` in the SQL editor.
2. **Admin user**: Authentication > Users > *Add user* (email + password you choose). Then turn **off** "Allow new users to sign up" so only that user can write.
3. **Env vars** (`.env` locally, Netlify > Site settings > Environment variables): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (see `.env.example`). The anon key is safe to expose; row-level security limits writes to the signed-in admin.
4. **Netlify**: connect the repo. `netlify.toml` already sets `npm run build` and `dist`.

## Local dev
`npm install && npm run dev`. Open `/?demo` to preview with sample donors when Supabase isn't configured. Admin is at `/admin.html` (linked from the footer).

## Editing the heart
`src/sections.js` holds each section's name, list price, color, and traced centerline points (from the Canva design). Adjust points to refine shapes. Section ids are the keys stored in the database.
