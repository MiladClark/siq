# siq

Lightweight, private voice channels, screen sharing, and text chat for friends.
Built with Next.js (App Router), Tailwind CSS v4, Drizzle ORM (Neon or standard Postgres), Vercel Blob (with local upload fallback), and LiveKit.

## Quick Start (Local Development with Docker)

1. **Install dependencies**
   ```bash
   pnpm install
   ```

2. **Start local Postgres and LiveKit**
   ```bash
   docker compose up -d postgres livekit
   ```

3. **Configure environment variables**
   Copy `.env.example` to `.env.local` (the defaults work directly with the local Docker stack):
   ```bash
   cp .env.example .env.local
   ```

4. **Push the Postgres schema**
   ```bash
   pnpm db:push
   ```

5. **Run the dev server**
   ```bash
   pnpm dev
   ```
   Open [http://localhost:3000](http://localhost:3000). The first account you register becomes the workspace admin and automatically creates starter channels (`#general`, `#clips`, `Lounge`, `Gaming`).

## Deployment on Vercel

1. Push this repo to GitHub and import it into Vercel.
2. In your Vercel project **Storage** tab, add **Neon Postgres** (sets `DATABASE_URL`) and **Vercel Blob** (sets `BLOB_READ_WRITE_TOKEN`).
3. Add `AUTH_SECRET` (any random 32+ character string) and your LiveKit Cloud keys (`NEXT_PUBLIC_LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`) in **Settings → Environment Variables**.
4. Run `pnpm db:push` once against your Neon database.
