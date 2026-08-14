# Handoff — Web dashboard

For whoever owns `apps/web`'s UI. Everything below is the contract you build
against; the API side is ours and already exists unless marked otherwise.

**Division of labour**

| Theirs (dashboard) | Ours (extension + API) |
| --- | --- |
| `apps/web/app/page.tsx`, `layout.tsx`, `globals.css` | `apps/web/app/api/**` |
| Sign-in and the connect-extension page | `packages/{schema,core,db,agents}` |
| Any dashboard views (saved listings, comps, history) | `apps/extension/**` — badges, panel, popup, options |

The extension's own UI — the inline badge, the detail panel, the popup, the
options form — is **not** part of this handoff. It renders inside Facebook's page
from a content script and is ours.

---

## Non-negotiables

These aren't style preferences; each one is load-bearing and the reason is short.

1. **Say "vs. similar asking prices", never "market value."** Our corpus is what
   sellers *ask*, not what cars *sold for*. Getting this wrong is how the product
   loses trust permanently, and it's a one-word mistake to make.
2. **`"insufficient"` comp confidence renders as "not enough data" — never as
   `$0` or a blank.** PEI is thin enough that this is a common, correct outcome.
   A `medianPriceCents` of `0` on an insufficient set is a sentinel, not a price.
3. **The headline number is the dollar delta, not a score.** `dealScore` is
   currently `null` by design — its weights must be fitted against a real corpus
   and there isn't one yet. Build the UI so a null score is normal, not an error
   state.
4. **Vehicle photos yes, seller identity no.** `photoUrls` carries the listing's
   photos of the car — use them. Seller names and profile links aren't in the API
   because they never leave the user's browser. Users click through to Facebook
   for anything about the seller.

   Two things about the photos: Facebook's CDN URLs are **signed and expire**, so
   render a placeholder rather than treating a broken image as an error. And
   `photoUrls` can be empty — plenty of listings have no photo.

5. **Linking to a listing:** we store `externalId`, not the URL. Build the link as
   `https://www.facebook.com/marketplace/item/{externalId}` — it's deterministic,
   which is why storing the URL would be redundant.
6. **Frame as information, not advice.** "Similar ones ask $X" — not "offer $Y".

---

## What to build, in order

### 1. Connect-extension page — *the one that unblocks everything*

The extension authenticates with a bearer token the user pastes into its options
page. Right now that token is issued from a CLI script, which is fine for us and
not fine for anyone else.

You need a page that, for a signed-in user:

- issues a token (`POST /api/tokens`, **planned** — see below)
- shows it **once**, with a copy button, and says plainly it won't be shown again
- lists existing tokens by label and last-used date
- revokes one

Only the SHA-256 of a token is stored, so "show it again later" is impossible by
construction rather than by policy.

### 2. Sign-in

better-auth with magic link + Google. **Not built yet — M1, and it's ours.**
Coordinate before building against it; the session shape isn't fixed.

**Never Facebook OAuth.** It grants `public_profile` and `email` and nothing we
need, and requires a Meta app review we would not pass.

### 3. Dashboard views — later, after M0 answers its gate question

Saved listings, comp history, price-drop charts. Deliberately unscoped: what's
worth showing depends on what the corpus turns out to support, and that's the
question M0 exists to answer. Don't design against imagined data.

---

## API contract

All routes take `Authorization: Bearer <token>` today. When better-auth lands,
dashboard routes move to session cookies and the extension keeps bearer tokens.

Types are exported from `@junkclaw/schema` — import them rather than
re-declaring, so a contract change breaks your build instead of your users.

### Exists

| Route | Method | Body | Returns |
| --- | --- | --- | --- |
| `/api/criteria` | `GET` | — | `SavedCriteria` |
| `/api/criteria` | `PUT` | `SavedCriteria` | `SavedCriteria` |
| `/api/score` | `POST` | `{ listingIds: string[] }` | `{ analyses: Analysis[], pending: string[] }` |
| `/api/ingest` | `POST` | `{ listings: ListingFacts[] }` | `{ accepted, listingIds }` — extension only |
| `/api/negotiate` | `POST` | `NegotiateRequest` | `NegotiateResponse` |

### Planned — tell us if you need these sooner

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/tokens` | `POST` | Issue an extension token. Returns the plaintext **once** |
| `/api/tokens` | `GET` | List active tokens: label, created, last used |
| `/api/tokens/:id` | `DELETE` | Revoke |

The database side of all three already exists (`issueToken`, `listActiveTokens`,
`revokeToken` in `@junkclaw/db`) and is integration-tested. They're unbuilt as
routes only because they need session auth, which needs better-auth.

### Shapes worth reading before you design

```ts
Analysis {
  listingId: string
  priceDeltaCents: number   // negative = cheaper than comparable asks
  dealScore: number | null  // null today, by design
  fitScore: number | null
  daysOnMarket: number
  priceDropCount: number
  comps: CompSet
  riskFlags: RiskFlag[]     // empty until M1
  computedAt: string
}

CompSet {
  listingIds: string[]
  medianPriceCents: number  // 0 when confidence is "insufficient" — a sentinel
  p25PriceCents: number
  p75PriceCents: number
  confidence: "insufficient" | "low" | "medium" | "high"
  wideningNote: string | null   // e.g. "±1 year, any trim, within 250 km"
}

RiskFlag {
  kind: "salvage_or_rebuilt" | "rust" | "needs_work" | ...
  evidence: string    // the seller's own words — quote it, don't paraphrase
  confidence: "low" | "medium" | "high"
}
```

`wideningNote` is written to be shown to the user verbatim. It's how they judge
whether a comp set is worth trusting, and it's more useful than the confidence
enum on its own.

---

## Running it

```sh
npx --yes pnpm@10 install
npx --yes pnpm@10 dev:web          # :3000
```

Needs `DATABASE_URL` (see `.env.example`). Without it the app builds and boots —
the database is constructed lazily — but any route touching data will 500.

Ask us for a token: `npx --yes pnpm@10 token:issue you@example.com`.
