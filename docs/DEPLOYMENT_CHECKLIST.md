# Portfolio deployment checklist

Run through this before the public site goes live. Nothing here spends money: the portfolio build cannot call a model.

## Before deploying

- [ ] `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` all pass.
- [ ] `npm run build:portfolio && npm run start:portfolio`, then `npm run verify:portfolio -- http://127.0.0.1:3001` prints "All checks passed".
- [ ] `git status` shows no `.env*` (other than `.env.example`), `data/`, `.next-portfolio/` or `.netlify/` files.
- [ ] `git grep -nE 'sk-ant-[A-Za-z0-9_-]{20,}'` matches only the obviously fake fixtures in `tests/`.

## Netlify project

- [ ] Build settings come from `netlify.toml` (no overrides in the UI). If the project is connected to Git, auto-publishing is locked until the draft is approved.
- [ ] Environment variables contain **no API keys**. Optional: `PUBLIC_GITHUB_URL`, `PUBLIC_LINKEDIN_URL` (https only).
- [ ] Netlify AI features are **off** for the team or project (otherwise the AI Gateway injects provider credentials into functions).
- [ ] First deploy is a **draft** (built from a clean clone) or Deploy Preview, not production.

## On the preview URL

- [ ] `npm run verify:portfolio -- https://<preview-url>` prints "All checks passed".
- [ ] `curl -si -X POST https://<preview-url>/api/execute -H 'content-type: application/json' -H 'origin: https://<preview-url>' -d '{"instruction":"Summarize this.","allowLive":true}'` returns **403** with "Execution unavailable in Portfolio Mode".
- [ ] Function logs show `[control-plane] portfolio mode` and `AI-provider variables in environment: none`, and no unexpected "ignored" settings.
- [ ] The draft URL sends `X-Robots-Tag: noindex` (the verify script checks this); after publishing, the production URL does not.
- [ ] Every page shows Portfolio Mode (the top-bar pill on desktop, a banner on smaller screens); all six scenarios on the overview run and finish in 1–3 s.
- [ ] `/about` explains what's real and what's simulated; footer links (if set) point to the right profiles.
- [ ] Quick phone check: overview, a scenario run, the Comparison Lab.
- [ ] Response headers include `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`.

## Publish

- [ ] Promote the verified deploy to production (publish it in the Netlify UI, or `netlify deploy --build --prod` from a clean clone).
- [ ] Re-run `npm run verify:portfolio -- https://<production-url>`.
