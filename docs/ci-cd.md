# CI/CD

What runs automatically, what needs a human, and what is deliberately not
automated yet.

## The pipeline

| Workflow | Trigger | What it does |
| --- | --- | --- |
| [`ci.yml`](../.github/workflows/ci.yml) | every push to `main`, every PR | guards → lint → typecheck → test → build web + extension → upload the unpacked extension as an artifact |
| [`release-extension.yml`](../.github/workflows/release-extension.yml) | tag `v*` | re-runs the full gate, checks the tag matches the manifest version, zips the extension, creates a GitHub release with the zip attached |
| [`migrate.yml`](../.github/workflows/migrate.yml) | manual only | verifies migrations are in sync with `schema.ts`, then applies them to the chosen environment |

Baseline the pipeline enforces: **5 guards, 0 lint errors, 6 packages
typechecking, 34 tests.** If a change moves those numbers, say so in the PR.

### The guards

`scripts/guards.sh` checks invariants a type-checker can't state. Run it locally
before pushing — it takes under a second.

1. **The ingest DTO stays a `strictObject`.** Downgrade it to `z.object()` and
   seller PII rides along in unknown keys with nothing failing at the boundary.
2. **`packages/core` imports no agent framework.** The spending ceiling lives
   there specifically so no model is in its call stack; this catches someone
   silencing the eslint rule rather than heeding it.
3. **Relative imports carry no `.js` extension.** Turbopack won't map
   `./foo.js` → `./foo.ts` in a source-shipped package, and the error it gives
   ("The module has no exports at all") points nowhere near the cause.
4. **No `.env` is tracked.**
5. **The extension schedules no recurring work.** Background polling of
   Marketplace is what gets the *user's own* Facebook account banned. If opt-in
   alerting ever ships, this guard changes in the same commit — deliberately.

## Deploying the web app — do this in Vercel, not in Actions

Vercel's Git integration already gives preview deploys per PR and production on
`main`. Reimplementing that in a workflow means holding a deploy token, and it
loses preview URLs on PRs. **Connect the repo in Vercel instead:**

1. Vercel → Add New → Project → import `kverhulp/JunkClaw`.
2. **Root Directory:** `apps/web`, and enable *Include files outside the root
   directory* — the app depends on four workspace packages.
3. **Install Command:** `pnpm install --frozen-lockfile` (run from the repo root).
4. Environment variables, per environment: `DATABASE_URL`, `BETTER_AUTH_SECRET`,
   `BETTER_AUTH_URL`, `ANTHROPIC_API_KEY`, and optionally `JUNKCLAW_MODEL`.

Both `pnpm build` targets run in CI **without** `DATABASE_URL` on purpose:
`@junkclaw/db` and the Mastra instance are lazily constructed, so a missing
variable surfaces on the first request rather than only at deploy time.

## Secrets and environments to create

None of these exist yet; CI is green without them, and each workflow that needs
one fails with a sentence telling you what to add.

| Where | Name | Needed for |
| --- | --- | --- |
| Settings → Environments → `staging` / `production` | `DATABASE_URL` | `migrate.yml`. Use a GitHub *environment* rather than a repo secret so production migrations can require a reviewer. |
| Vercel project settings | the four vars above | running the app |
| Repo secrets (later) | `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN` | automated Web Store upload |

## Not automated, on purpose

**Chrome Web Store publishing.** The listing needs a privacy policy and a written
justification for reading `facebook.com` and transmitting data off-device before
the first submission is possible at all. That is a review conversation, not a CI
step. Automate the upload after the listing exists and one manual submission has
been through review — until then `release-extension.yml` produces the exact zip
to upload by hand.

**Migrations on merge.** A migration can't be undone by redeploying the previous
commit. Manual dispatch until there is a rollback story worth trusting.

## Suggested branch protection

Once you're working through PRs, require on `main`: the **Lint · typecheck ·
test** and **Build web · extension** checks, and a linear history. Given you're
the only committer today this is optional — but the checks are what make a
Dependabot PR safe to merge without reading every transitive bump.
