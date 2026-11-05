# Working in this repository

## Commits

- Author commits as the repository's existing identity, `P. Sinha <parmanandsinha@gmail.com>`, never as an AI tool.
- One brief line in the imperative, matching the existing history. Add a body only when a decision needs recording.
- No attribution of any kind: no `Co-Authored-By` trailers, no "Generated with", no session links, no tool or model names in commit messages, pull request text, code comments, or content.
- Do not add invisible or hidden markers anywhere: no zero-width characters, hidden comments, or metadata that identifies a tool.
- `.claude/settings.json` turns attribution off. Keep it that way.

## Before committing

- Source changes: `npm run check && npm run test:unit`.
- Anything that changes rendered pages: `npm run build && npm run test:integration:built && npm run test:accessibility:built`.
- Before a pull request: `npm run publication:validate`.

## Design

- The design contract is `DESIGN.md`. Read it before changing layouts, components, or styles.
- Use the component vocabulary it names (Starlight's components and the site's own). Do not invent one-off classes; every class used in a template must be defined in a stylesheet, and a unit test checks this.
- One component per pull request for UI work. Update `DESIGN.md` and the tests that name the component in the same change.
