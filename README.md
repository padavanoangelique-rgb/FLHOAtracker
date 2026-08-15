# HOA Tracker — Deployment Guide

Follow these steps in order. This mirrors exactly how Permit Inventory is set up
(Supabase + Vercel + GitHub), just for a new project.

## 1. Create the Supabase project
1. Go to supabase.com → New project.
2. Name it something like `hoa-tracker`, set a database password (save it somewhere safe), pick a region close to Florida.
3. Once it's created, go to **SQL Editor → New query**, paste the entire contents of `supabase/schema.sql`
   from this project, and run it. This creates the `hoas`, `jobs`, and `documents` tables, turns on
   row-level security, and creates the `hoa-documents` storage bucket.
4. Go to **Project Settings → API**. Copy the **Project URL** and the **anon public** key — you'll need both next.
5. Go to **Authentication → Users → Add user** and create a login for yourself (and each staff member who
   needs access) with an email + password.

## 2. Add the code to your GitHub repo
1. Copy every file from this project into your `FLHOAtracker` (or whatever you named it) GitHub repo — keep the
   folder structure exactly as-is (`app/`, `lib/`, `supabase/`).
2. Commit and push to GitHub.

## 3. Set environment variables in Vercel
1. In your Vercel project (the one connected to this GitHub repo) → **Settings → Environment Variables**.
2. Add:
   - `NEXT_PUBLIC_SUPABASE_URL` = the Project URL from step 1.4
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the anon public key from step 1.4
3. Save, then trigger a redeploy (Vercel → Deployments → ⋯ → Redeploy), or just push a commit — Vercel
   auto-deploys on push once it's connected to the repo.

## 4. Connect FLHOAtracker.com
1. In Vercel → your project → **Settings → Domains**, add `flhoatracker.com` (and `www.flhoatracker.com` if
   you want both).
2. Vercel will show you DNS records (usually an A record and/or CNAME) to add at wherever you registered the
   domain (GoDaddy, Namecheap, etc.).
3. Add those records in your domain registrar's DNS settings. This can take a few minutes to a few hours to
   propagate.

## 5. Verify
1. Visit flhoatracker.com — you should land on the login page.
2. Log in with the account you created in step 1.5.
3. Add a test HOA, add a job to it, upload a small PDF, run a CSV import, and print a report to confirm
   everything's wired up correctly.
4. Delete the test data once you've confirmed it all works.

## Notes
- Every staff member needs their own login, created in Supabase → Authentication → Users. There's no public
  sign-up page by design — this keeps it staff-only, same as Permit Inventory.
- If a PDF upload fails, check the file size — Supabase's default limit is generous, but confirm your plan's
  storage limits if you're uploading a lot of large files.
- If something doesn't build on Vercel, check the build logs first — most issues are a missing environment
  variable or a typo in the Supabase URL/key.
