# AutoScout — Design System Notes

For any agent working on this project. This is a Design Components (DC) project — every screen is a `.dc.html` file that opens standalone and streams live.

## Base system: Modernist

Bound design system at `_ds/modernist-dc413a56-a71a-4c5d-b70c-c3858ab2acad/`. Load in every page's `<helmet>`:

```html
<link rel="stylesheet" href="_ds/modernist-dc413a56-a71a-4c5d-b70c-c3858ab2acad/styles.css">
<script src="_ds/modernist-dc413a56-a71a-4c5d-b70c-c3858ab2acad/_ds_bundle.js"></script>
```

Modernist is flat and architectural: Archivo type, 0 border-radius everywhere, strong 2px hairline rules instead of shadows/cards, flush-left labels (including inside wide buttons), a single red accent used sparingly.

Use its classes rather than inventing new ones: `.nav`/`.nav-brand`, `.btn`/`.btn-primary`/`.btn-secondary`/`.btn-ghost`/`.btn-icon`/`.btn-block`, `.field`+`.input`, `.tag`/`.tag-outline`/`.tag-neutral`, `.card`+`.card-kicker`, `.table`, `.dialog-backdrop`+`.dialog`, `.hr`, `.radio`+`.dot`.

## Palette override — cream/beige, not the stock gray

Every page overrides Modernist's default cool-gray tokens with a warm cream/beige palette via a local `<style>` block in `<helmet>` (after the stylesheet link, so it wins):

```css
:root {
  --color-bg: #FAF5E9;
  --color-surface: #F2E9D5;
  --color-neutral-100: #FDFAF2;
  --color-neutral-200: #F7EFDD;
  --color-neutral-300: #E6D8BE;
  --color-neutral-400: #D8C6A5;
  --color-divider: color-mix(in srgb, #4a3f2f 35%, transparent);
}
```

**The red accent (`--color-accent`, `--color-accent-700`, etc.) is untouched** — never change it when asked to adjust "colors" unless explicitly told to touch red. `--color-accent-700` is used for accent-colored text (deal deltas, "below asking price" headlines) since the raw accent isn't dark enough for body-size text contrast.

Secondary body font on the Listings page only: IBM Plex Sans (`--font-body-secondary`), paired with Archivo headings for slightly better paragraph legibility. Not applied elsewhere unless asked.

## Site structure

Product name: **AutoScout** (rebranded from working name "JunkClaw" — file names still say `JunkClaw *.dc.html`, only visible copy changed).

Pages (all at project root):
- `JunkClaw Dashboard.dc.html` — marketing home: hero, agent-capability rotator, 3-feature row
- `JunkClaw Badge Overlay.dc.html` — "Listings" — the vehicle catalogue, filters, listing-detail popup
- `JunkClaw Profile.dc.html` — sidebar-tabbed: Profile / Preferences / Watchlist
- `JunkClaw Connect Extension.dc.html` — token issue/list flow
- `JunkClaw Negotiate.dc.html` — negotiation workflow + approval dialog (standalone concept screen, M2/speculative)
- `JunkClaw Listing Detail.dc.html`, `JunkClaw Extension Popup.dc.html` — earlier standalone component explorations, not linked from nav

## Shared chrome — copy this exactly on new pages

**Nav** (every real page has this, brand links home):
```html
<div class="nav">
  <a href="./JunkClaw Dashboard.dc.html" class="nav-brand" style="text-decoration:none;color:inherit;font-size:22px;display:flex;align-items:center;gap:8px">
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style="flex:none">
      <rect width="18" height="18" fill="var(--color-accent)"></rect>
      <circle cx="9" cy="9" r="6" fill="none" stroke="#ffffff" stroke-width="1.4"></circle>
      <line x1="9" y1="9" x2="9" y2="3" stroke="#ffffff" stroke-width="1.3"></line>
      <line x1="9" y1="9" x2="14.7" y2="6.7" stroke="#ffffff" stroke-width="1.3"></line>
      <line x1="9" y1="9" x2="12.7" y2="13.8" stroke="#ffffff" stroke-width="1.3"></line>
      <line x1="9" y1="9" x2="5.3" y2="13.8" stroke="#ffffff" stroke-width="1.3"></line>
      <line x1="9" y1="9" x2="3.3" y2="6.7" stroke="#ffffff" stroke-width="1.3"></line>
      <circle cx="9" cy="9" r="1.4" fill="#ffffff"></circle>
    </svg>AutoScout
  </a>
  <a href="./JunkClaw Dashboard.dc.html">Dashboard</a>
  <a href="./JunkClaw Badge Overlay.dc.html">Listings</a>
  <a href="./JunkClaw Profile.dc.html">Profile</a>
  <a href="./JunkClaw Connect Extension.dc.html">Connect extension</a>
</div>
```
Mark the current page's link with `aria-current="page"` instead of an href (e.g. `<a href="#" aria-current="page">Dashboard</a>`). No back button — removed per explicit request.

The logo mark is a red square with a white 5-spoke wheel-rim glyph (deliberately not a magnifying glass, not a checkmark, not stripes — went through a few iterations before landing here). Reuse this exact SVG; don't redesign it without being asked.

**Footer** (every real page has this, full-bleed, sits after the page content inside the outer background div):
```html
<footer style="background:var(--color-surface);color:var(--color-text)">
  <div style="max-width:1200px;margin:0 auto;padding:48px 24px 32px;display:flex;justify-content:space-between;gap:40px;flex-wrap:wrap">
    <div>
      <div style="display:flex;align-items:center;gap:8px;font-family:var(--font-heading);font-weight:800;font-size:20px;color:var(--color-text);margin-bottom:6px">[same logo svg]AutoScout</div>
      <div style="font-size:13px;color:var(--color-text);opacity:0.7">Founded 2026</div>
    </div>
    <div style="display:flex;gap:64px;flex-wrap:wrap">
      <div>
        <h6 style="color:var(--color-text);opacity:0.75;margin-bottom:10px">Quick links</h6>
        <div style="display:flex;flex-direction:column;gap:8px;font-size:14px">
          <a href="./JunkClaw Dashboard.dc.html" style="color:var(--color-text);text-decoration:none">Dashboard</a>
          <a href="./JunkClaw Badge Overlay.dc.html" style="color:var(--color-text);text-decoration:none">Listings</a>
          <a href="./JunkClaw Profile.dc.html" style="color:var(--color-text);text-decoration:none">Profile</a>
          <a href="./JunkClaw Connect Extension.dc.html" style="color:var(--color-text);text-decoration:none">Connect extension</a>
        </div>
      </div>
      <div>
        <h6 style="color:var(--color-text);opacity:0.75;margin-bottom:10px">Legal</h6>
        <div style="display:flex;flex-direction:column;gap:8px;font-size:14px">
          <a href="#" style="color:var(--color-text);text-decoration:none">Privacy policy</a>
          <a href="#" style="color:var(--color-text);text-decoration:none">Terms of service</a>
        </div>
      </div>
    </div>
  </div>
  <div style="border-top:2px solid var(--color-divider);padding:16px 24px;max-width:1200px;margin:0 auto;font-size:12px;color:var(--color-text);opacity:0.55">© 2026 AutoScout. All rights reserved.</div>
</footer>
```
Footer background is `--color-surface` (matches the "New token" card's own surface, not its inner textbox `--color-neutral-100`) — went through a couple of rounds of correction, keep it on `--color-surface`. Text is dark ink, not white — the surface is too light for white text.

## Product voice — non-negotiable copy rules

Carried over from the original JunkClaw handoff doc; still apply verbatim to AutoScout:

1. **"vs. similar asking prices," never "market value."** The corpus is what sellers ask, not what cars sold for.
2. **`insufficient`/no-data states render as "not enough data," never `$0` or blank.**
3. **The headline number is the dollar delta, never a score.**
4. **Frame as information, not advice** — "similar ones ask $X," not "offer $Y." (See the Negotiate page's disclaimer line.)
5. Extension reads the user's own logged-in session — never implies a scraper or an official API.

## Known environment issue (not a design bug)

Screens intermittently fail to load `support.js` and the Modernist `_ds_bundle.js`/`styles.css` with `resource_error` in console — a platform-side serving issue, not something fixable by editing page content. If you see raw `{{ }}` template text or unstyled serif fallback rendering, check whether this is happening before assuming a template/logic bug.
