# Design contract

The site is a plain [Starlight](https://starlight.astro.build) site. Starlight owns the shell: header, search, sidebar, "On this page", pager, skip link. The site adds a stylesheet, four small overrides and a few components. Change the shell by configuring Starlight, not by rebuilding it. Update this file in the same change as the design.

## Files

| Concern | Where |
| --- | --- |
| Pages, one file each; the URL is the file path | `src/content/docs/**/*.md(x)` |
| Home page (splash template, Starlight hero with one action; the trust line under it) | `src/content/docs/index.mdx` |
| Test record pages, one per record | `src/pages/applicability/[id].astro`, from `src/content/applicability/*.yml` |
| Feed, URL manifest | `src/pages/feed.xml.ts` (items in `src/content/feed.yml`), `src/pages/url-manifest.json.ts` |
| Sidebar, head entries, overrides, Markdown options | `astro.config.mjs` |
| Home keeps its sidebar under the splash template | `src/route-middleware.ts` |
| `@release` in content becomes the release being built | `plugins/release-refs.mjs` |
| Every style | `src/styles/custom.css` |

## Page frontmatter

Only Starlight's fields (`title`, `description`, `template`, `hero`, `sidebar`, `tableOfContents`, `prev`, `next`, `lastUpdated`, `editUrl`, `pagefind`) plus `l2c.kindLine` (the line above the title, "Module 2 · Hands-on · about 30 min") and `l2c.lede` (the sentence below it). Everything else a page shows is in its body.

A heading keeps an anchor that predates its text with `## Text {#anchor}`. Use that form, not a raw `<h2>`, so the heading appears in "On this page".

## Overrides

- `PageTitle`: kind line, the h1 (`id="_top"`, the skip-link target; hyphenated words kept on one line), lede.
- `Hero`: the title, tagline and actions before the figure, so reading order and the phone layout agree.
- `ThemeSelect`: one button, named "Dark theme", with a sun or moon icon and `aria-pressed`. Before any choice the page follows the operating system and nothing is stored; a press stores `light` or `dark` under Starlight's key `starlight-theme` (cleared when the choice matches the system), so Starlight's head script applies it before paint. Hidden without JavaScript.
- `Footer`: edit link, last updated, pager, site links, and the acknowledgment from `src/content/acknowledgment.ts`, verbatim, on every page.

## Components

| Component | Takes | Notes |
| --- | --- | --- |
| `TestedBadge` | `record` id, `variant` (`badge` or `summary`) | The only source of tested claims: "Tested" plus "Purdue Anvil · Oct 2026 · Test record" and the rows Tested, You need, Depends on your center, all read from the record (`src/content/evidence.ts`). The badge stays outside every disclosure. |
| `ImplementationReference` | heading and intro as children | The six excerpts from `src/content/implementation.ts`. Title (h3), source link and annotation stay visible; the code sits in a closed `<details>`, "Show the code (N lines)" plus a visually hidden ": title". The build fails if a `baseline.sbatch` excerpt is not the script's own lines. Ordinary Markdown code blocks stay visible. |
| `Timeline` | `highlight` (step 1 to 6) | The six steps of one allocation, from `src/content/timeline.ts`. |
| `Diagrams` | `name` | Inline SVG, text 14px in a 720-unit viewBox. |
| `ConceptMap`, `Crosswalk` | title and intro; optional `record` slot | The four concepts from `src/content/concepts.ts`; the crosswalk rows from `src/content/crosswalk.ts`, with an optional click-to-highlight script. |
| `Doors` | `doors` | Three Starlight cards on the home page. |
| `TalksList` | none | Talks and posters from `src/content/talks.yml`, newest first, on the talks page. |
| `Acknowledgment` | none | The acknowledgment as a page section, beside a hosted download. |

Starlight's own components are used as they are: `Aside`, `LinkButton`, `Card`, `CardGrid`, `LinkCard`.

## Styles

`custom.css` declares the cascade layers first: `l2c-base, starlight, l2c-theme, l2c-components, l2c-utilities`. Starlight's rules sit in `starlight`, so a site rule in a later layer wins without specificity games. Then, in order: tokens (both themes, print, forced colours), the self-hosted `@font-face` rules (two of them preloaded in `astro.config.mjs`), the mapping onto Starlight's `--sl-*` properties, one block per component, utilities, and the crosswalk and cheat-sheet enhancements.

- Type scale: body 16px, labels 15px, supporting text 14px, h1 32px at desktop (28px narrow), h2 24px, h3 20px. Prose measure 40rem inside a 42rem column, centred; the home page column is 72rem.
- Both themes follow the operating system unless the reader presses the theme toggle. Code colours that fall under 4.5:1 are swapped in `astro.config.mjs` (`CODE_CONTRAST`).
- No motion, no inline styles, no one-off classes. Links in the main pane carry a cue that is not colour. Focus ring: 2px solid, offset 2px.

## Disclosure

A `<details>` with a named `<summary>` may hide detail. It never hides a warning, a prerequisite, the Tested badge, or a reporting or recovery link, with one exception: each entry on `/diagnostics/` is a closed `<details class="diagnostic-entry">` whose `<summary>` holds the entry's h2, because a reader arrives there by ID. The entry keeps its id `bssw-<x>`, the heading `bssw-<x>-heading`, the sections `bssw-<x>--signal` and the rest, and the four earlier-name aliases; a line above the index says the entries expand, and the page's closing support link stays outside them. Print opens every disclosure, and a link to any id inside one opens it, on load and on `hashchange` (head scripts in `astro.config.mjs`).

## Checks

1. Build: `npm run check` (0 errors) and `npm run build`; `tests/built/routes.test.ts` pins the published routes.
2. Workflow and evidence: `npm run validate:evidence`, `tests/unit/implementation-excerpts.test.ts`, `tests/built/tested-badge.test.ts`, `tests/unit/baseline-workflow.test.ts` and the `layered-workflow-*` tests.
3. Links and accessibility: `tests/built/links.test.ts`, and `npm run test:accessibility:browser` (axe on every page, light and dark).
4. Acknowledgment: `tests/built/acknowledgment.test.ts` (every page) and `tests/unit/readme-acknowledgment.test.ts`.
5. Boundary: `npm run validate:boundary`, `tests/unit/boundary*.test.ts`.

Before committing: `npm run check && npm run test:unit`; for anything rendered, `npm run build && npm run test:integration:built && npm run test:accessibility:browser`.
