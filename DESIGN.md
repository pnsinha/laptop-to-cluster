# Design contract

The site is built on [Starlight](https://starlight.astro.build) (Astro's documentation framework). Starlight owns the page shell: the header with the site title, search and the theme select; the sidebar with the learning path; the "On this page" list; the pager; the skip link; keyboard focus handling for the narrow menu. The site owns its tokens, its typography, its own components, and the footer. Change the shell by configuring or overriding Starlight, not by rebuilding it.

This file is the contract. Read it before changing a layout, a component or a stylesheet, and update it in the same change.

## Files

| Concern | Where |
| --- | --- |
| Starlight configuration, head entries, component overrides | `site/astro.config.mjs` |
| Sidebar groups | `site/src/content/sidebar.ts` |
| Page chrome (kind line, lede, status notices, pager, edit link) | `site/src/content/page-chrome.ts`, `site/src/components/starlight/PageTitle.astro` |
| Footer (edit link, last updated, pager, site information, acknowledgment) | `site/src/components/starlight/Footer.astro` |
| Hero (home page) | `site/src/components/starlight/Hero.astro`, `site/src/content/home.ts`, `site/src/content/hero-figure.ts` |
| Every page | `site/src/layouts/BaseLayout.astro` wraps `StarlightPage` |
| Learning modules | `site/src/layouts/LearningModuleLayout.astro` |
| Tokens | `site/src/styles/tokens.css` |
| Token mapping onto Starlight, typography, frame | `site/src/styles/starlight-theme.css` |
| The site's own components | `site/src/styles/components.css` |
| Optional enhancements (crosswalk highlight, cheat-sheet print) | `site/src/styles/enhancements.css` |
| Cascade layers | `site/src/styles/layers.css` |

## Cascade layers

`layers.css` declares, in this order: `l2c-base, starlight, l2c-theme, l2c-components, l2c-utilities`. Starlight's own rules sit in `starlight`, so a site rule in a later layer wins without specificity games. Names are flat on purpose: a dotted name such as `l2c.theme` would nest under a parent declared before `starlight` and lose. `tokens.css` is unlayered custom properties. `enhancements.css` is unlayered and scoped by the `.crosswalk` and `.cheat-sheet` prefixes.

Which layer a rule belongs in:

- **l2c-theme** (`starlight-theme.css`): `--sl-*` values, type families and sizes, link cues, the focus ring, the hero, the frame (sidebar and "On this page" column), nothing component-specific.
- **l2c-components** (`components.css`): one block per site component, named below.
- **l2c-utilities** (end of `components.css`): the wide-figure breakout, print, forced colours, reduced motion.

## Tokens

`tokens.css` holds the palette (light base, dark under `prefers-color-scheme: dark` and under a stored dark choice, print, forced colours), the type ramp, spacing, lines, radii, focus and the concept hues. Starlight reads `--sl-color-*`, `--sl-text-*` and `--sl-font*`; `starlight-theme.css` maps those onto the site's tokens, so one palette serves both. Do not set a colour, size or face outside `tokens.css`; the publication validator and the accessibility scanner read the token strings.

Type floors the scanner enforces: body 16px, controls 15px (`--text-label`, also `--sl-text-sm`), supporting text 14px (`--text-fine`, also `--sl-text-xs`), diagram text 14px as rendered.

Theme: Starlight serves `data-theme="dark"` in the HTML and its head script sets `light` or `dark` from the stored choice (`localStorage` key `starlight-theme`) or the operating system. The head script in `astro.config.mjs` marks a scripted page with `data-l2c-js` and keeps the `theme-color` meta in effect on the page canvas. `tokens.css` honours the dark choice only on a marked page, so a page without JavaScript follows the operating system. The select works only once its script has defined the element; until then it is hidden.

## Frame

- Reading column `--sl-content-width: 42rem`; the home page (`[data-has-hero]`) uses 72rem.
- Wide figures (`.timeline`, `.diagram`, `.implementation-reference`, `.technical-figure`) break out to the main pane, up to 72rem, centred around the column. The content panel is the size container.
- The "On this page" column appears from 90rem; below that the dropdown under the header serves. Starlight would show the column from 72rem, which leaves the figures too narrow.
- Sidebar groups, in order: Guide, Learning path (open), While you run it, Evidence, Project (collapsed). The pager follows the learning path only.
- Skip link targets the page title (`#_top`). Every page has one `h1` with that id.

## Component vocabulary

Starlight's components, used as they are:

| Component | Used for |
| --- | --- |
| `StarlightPage` | every page, through `BaseLayout` |
| `Card`, `CardGrid` | the three doors on the home page (three columns from 64rem) |
| `LinkCard`, `CardGrid` | the guide page's tiles |
| `LinkButton` (`primary`, `secondary`, `minimal`) | hero actions and the closing actions on the home page; `minimal` is underlined |
| `Aside` (`note`, `tip`, `caution`, `danger`) | status notices under the page title, callouts in content |
| `EditLink`, `LastUpdated`, `Pagination` | inside the footer override |

The site's own components, each with one block in `components.css` and a test that names it:

| Component | Class root | Notes |
| --- | --- | --- |
| Concept markers | `.c-step`, `.c-gate`, `.c-scratch`, `.c-net` | text on tint plus a shape; shared chip rule |
| Hero figure | `.hero__figure`, `.env`, `.env-pair` | plain HTML from `hero-figure.ts`, after the copy |
| Doors | `.doors`, `.door` | inside Starlight cards; the eyebrow is the card title |
| Concept map | `.concepts`, `.concept` | the big idea rows |
| Crosswalk | `.crosswalk` | legend, one disclosure, the panes; two columns from 56rem of its own width |
| Timeline | `.timeline` | six steps; a row from 48rem of its own width |
| Diagrams | `.diagram`, `.diagram-svg` | inline SVG, text 14px in a 720-unit viewBox |
| Evidence | `.applicability-projection`, `.evidence-badge`, `.evidence-panel`, `.evidence-rows`, `.record-summary` | the badge stays outside every disclosure |
| Implementation reference | `.implementation-reference`, `.source-excerpt` | one disclosure per excerpt |
| Tables | `.table-overflow`, `.layout-data` | a labelled scroll region around every table |
| Notices | `.notice` | warnings are a double rule plus the word |
| Sources | `.sources-scope` | one disclosure |
| Page header | `.content-header` | kind line, title, lede |
| Footer | `.l2c-footer`, `.l2c-site-info` | site information links and the verbatim acknowledgment |
| Home | `.site-facts`, `.home-close`, `.home-credit`, `.event-band` | |
| Diagnostics, cheat sheet, talks, support | `.diagnostic`, `.cheat-sheet`, `.talk`, `.support-state` | |

Rules:

- Every class a template uses is defined in a stylesheet, and every class a stylesheet defines is used; `tests/unit/stylesheet-foundation.test.ts` checks both. Starlight's and Astro's classes are listed there as provided.
- No one-off classes and no inline styles. Markdown content carries no class names except through the build (tables, code).
- No motion: no transitions or animations in the site's stylesheets; Starlight's sidebar caret is reset. Reduced motion neutralises anything left.
- Links in the main pane carry a cue that is not colour: an underline, or the border of a filled button or pager link.
- Focus ring: 2px solid `--focus`, offset 2px, everywhere; `Highlight` under forced colours.

## Disclosure

Progressive disclosure is a `<details>` element with a named `<summary>`. It may hide detail; it may never hide a warning, an unvalidated-scope notice, the evidence scope, a prerequisite, or a reporting or recovery link. The publication validator reads every built page for this. Print opens every disclosure and restores it afterwards (head script).

## Copy

- One `h1` per page. Headings in the display serif, prose in the reading serif, interface in the sans.
- A page says what it is in the kind line above the title (`pageHeaderLine`), then the lede.
- Status notices are Starlight asides under the title, never inside the body.
- Labels are frozen in `site/src/content/contracts.ts` and `wording.ts`; tests use them.

## Changing the design

1. Tokens: edit `tokens.css`, run `npm run test:unit` (token pairs, contrast) and the browser scan.
2. The shell: configure Starlight in `astro.config.mjs` or override a component under `site/src/components/starlight/`; keep Starlight's class names so its rules and the theme rules still apply.
3. A component: one per pull request. Edit its block in `components.css`, its `.astro` file, the test that names it, and this file.
4. Before committing: `npm run check && npm run test:unit`; for anything rendered, `npm run build && npm run test:integration:built && npm run test:accessibility:built && npm run test:accessibility:browser`.
