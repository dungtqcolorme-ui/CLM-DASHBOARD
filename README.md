# CLM DASHBOARD

Next.js App Router project for the ColorME dashboard, connected to Supabase and
prepared for continuous deployment on Vercel.

## Local setup

1. Copy `.env.example` to `.env.local` and replace both values with the project
   URL and anon public key from Supabase.
2. Install dependencies with `pnpm install`.
3. Run `pnpm dev` and open <http://localhost:3000>.
4. Check Supabase with `pnpm test:supabase` or open
   <http://localhost:3000/api/health/supabase>.

`.env.local` is ignored by Git and must never be committed.
