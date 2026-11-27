# Workspace Guidelines

- **Always Push Verified Changes:** After completing any code edits and running verification (`pnpm typecheck` and `pnpm build` / tests), automatically stage the modified files, commit with a clear message, and `git push origin main` so Vercel deploys automatically. Never leave verified code changes unpushed.
- **Keep Secrets & Local Cache Untracked:** Never stage or commit `.env`, API keys/tokens, `dist/`, `data/`, or untracked local assets such as `assets/video/`.
- **Deployment & Compliance Constraints:** Default Vercel builds (`process.env.VERCEL`) run `540p` (`REEL_RESOLUTION=540p`) to stay under the `60s` serverless limit. Avoid fake `"LIVE"`/`"লাইভ"`/`"সরাসরি"` overlays, debug labels, or `"link in comments"` CTAs in reel output, and keep existing channel brand names intact unless explicitly asked to rename them.
