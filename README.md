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
   Open [http://localhost:3100](http://localhost:3100). The first account you register becomes the workspace admin and automatically creates starter channels (`#general`, `#clips`, `Lounge`, `Gaming`).

## Deployment on Vercel

1. Import the GitHub repository or update the existing Vercel project before deploying this layout. Set **Root Directory** to `apps/web` and enable **Include source files outside of the Root Directory in the Build Step** so the workspace dependencies are available. Set **Install Command** to `npx --yes pnpm@11.24.0 install --frozen-lockfile` and **Build Command** to `pnpm run build`.
2. In your Vercel project **Storage** tab, add **Neon Postgres** (sets `DATABASE_URL`) and **Vercel Blob** (sets `BLOB_READ_WRITE_TOKEN`).
3. Add `AUTH_SECRET` (any random 32+ character string) and your LiveKit Cloud keys (`NEXT_PUBLIC_LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`) in **Settings → Environment Variables**.
4. Run `pnpm db:push` once against your Neon database.

## Workspace layout

- `apps/web` contains the Next.js web app, API, and database code. From the repository root, use `pnpm dev` for local development and `pnpm build` for a production build. The root `.env.local` and `.local-uploads` paths still apply.
- `apps/desktop` contains the Windows desktop app and Tauri code. Use `pnpm desktop:ui` to build the static interface, `pnpm desktop:dev` to run the app, or `pnpm desktop:build` with the Windows Tauri prerequisites installed to build `apps/desktop/src-tauri/target/release/siq-desktop.exe`.
- `packages/shared` contains the interface, fonts, sounds, audio worklets, and shared API types. Each app resolves `@/lib/client-api` and `@/lib/voice-controls` to its own implementation.

The desktop app connects to `https://siq-zeta.vercel.app` by default. Set
`SIQ_API_ORIGIN` before building to use another HTTPS deployment with the workspace
and sign-in API in this repository.
