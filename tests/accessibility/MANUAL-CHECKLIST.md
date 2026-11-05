# Manual accessibility checks for a release

The scanner (`npm run test:accessibility:browser`) automates what a script can prove: axe in both schemes, token contrast, keyboard order and focus rings, reflow at 320/768/1280 px and 200% zoom, forced-colors and print emulation, JavaScript off, blocked fonts, theme precedence, and reduced motion. The checks below need a person with a keyboard and a screen reader. Record each result in `releases/<version>/accessibility-review.yml`. When you sign it, also record the commit and the https deployment URL you reviewed (`reviewedCommit`, `reviewedDeploymentUrl`): the production release checks that nothing but the review file changed after that commit.

When you sign:
- **Notes:** append your manual findings to the existing notes; do not rewrite them. The release tests pin parts of each note, and they run again on the signing commit after the tag is pushed.
- **URL:** record the per-deployment `*.pages.dev` URL from the rc run's summary, not the `preview` alias, which the next push to the showcase branch replaces.
- **Before tagging the release:** on the signing commit, run `npx vitest run tests/unit/accessibility-review-v020.test.ts` and `npx tsx scripts/validate-accessibility-review.ts --require-complete --release-sha HEAD`. Then wait for `ci.yml` to pass on `main` at that commit.
- **Date:** commit the signature on the day you deploy. The release record takes its date from that commit, and the release notes say the release date.

## Set up

1. `npm run build`, then `npx astro preview --root site --port 4321`.
2. Open `http://localhost:4321/` in Chrome and Safari. Pages to cover: `/`, `/guide/tour/`, `/guide/baseline-single-node-pattern/`, the current record under `/applicability/`, `/adoption/evaluate/`.
3. macOS: System Settings, Keyboard, turn on "Keyboard navigation" so Safari tabs to every control. Turn VoiceOver on and off with Cmd+F5. The VoiceOver modifier (VO) is Control+Option.

## A. Keyboard pass (Chrome, no mouse)

Start each page by clicking the address bar, then press Tab. Tick a box only if the behaviour is exactly as described.

- [ ] **Skip link.** First Tab shows "Skip to content" with a visible ring. Enter moves the view to the page title; the next Tab lands on the first control inside the page content, not back in the header or the sidebar.
- [ ] **Header.** Tab visits the site title, the search button, the GitHub link (external) and the theme select, in that order. Enter on the search button opens the search dialog; Escape closes it and returns focus to the button.
- [ ] **Sidebar navigation, wide.** Tab visits Guide, then the groups Learning path, While you run it, Evidence and Project, with each group's links in order (Learning path: The five-minute tour, Scheduler as Orchestrator, Run the example, Baseline Pattern, Translate a Compose file, Evaluate and adopt). Each group label is a disclosure that Enter or Space opens and closes; Project starts closed. The current page's link has a mark that is not only colour. Enter follows a link.
- [ ] **Sidebar navigation, narrow.** Resize the window to 320 px wide. Tab to the round "Menu" button, press Enter: the menu opens over the page, focus stays on the button, the next Tab lands on Guide. Escape closes the menu. No horizontal scrollbar at any point.
- [ ] **Theme control.** Tab to the theme select in the header (named "Select theme"; it reads Auto until you choose). Arrow keys or the dropdown choose Dark, Light or Auto: the page switches at once. Reload after choosing a theme that differs from the system: the choice is kept and the page does not flash the other theme. Auto follows the operating system again and nothing is remembered. The ring is visible in both themes.
- [ ] **Hero actions (home).** The filled "Take the five-minute tour" button and the underlined Compose link are each one Tab stop with a visible ring. Enter on the tour button opens the tour. The hero figure has no Tab stops.
- [ ] **Evidence badge and panel.** Tab to "What this means for you". Enter or Space opens it; the three rows (Tested, You need, Depends on your center) appear; "What hasn’t been tested yet" is the next Tab stop. Enter or Space on the summary closes it again; focus stays on the summary.
- [ ] **Timeline (modules).** On learning-module pages there is no Tab stop inside the timeline. The six steps read in order when you scroll.
- [ ] **Doors (home).** Exactly three Tab stops, one link per door, in the order Understand, Translate, Evaluate and adopt. Enter on each goes to its page. There is no hover-only content.
- [ ] **Concept rows (home).** Five Tab stops in the big-idea section, in order: the allocation link in the introduction, then one glossary link per row (job step, readiness gate, job-scoped scratch, loopback). No other Tab stops in the section.
- [ ] **Crosswalk.** The legend terms are buttons: Space selects one, a second Space clears it, and the selection is also shown by an outline, not only colour; selecting a term opens the code panes. "Show the Compose file beside the batch script" is one Tab stop that opens and closes the panes. Each code pane that scrolls sideways takes one Tab stop with a visible ring and scrolls with the arrow keys; Tab then leaves it (no keyboard trap).
- [ ] **On this page.** On a window wider than 1440 px the "On this page" list sits beside the content; its links are Tab stops after the content. Narrower, it is a dropdown under the header that Enter or Space opens.
- [ ] **Pager and Sources.** The previous and next links are ordinary links at the end of the content, learning-path pages only. The Sources disclosure opens and closes with Enter or Space.
- [ ] **Footer.** Tab visits "Edit page" (content pages), then the pager, then Release, Report a problem, Accessibility, Attribution and licenses, GitHub repository (external). The acknowledgment text is plain text, not a link.
- [ ] **Order.** On each page, the Tab order follows the reading order top to bottom with no jumps backwards.

## B. VoiceOver spot check (Safari, VoiceOver on)

Use VO+Right to move item by item and VO+U for the rotor (Headings, Landmarks, Links).

- [ ] **Landmarks.** Rotor, Landmarks: banner, navigation "Main", main, navigation "Site information", and on content pages the region "On this page". Learning modules also list the regions "Tested workflow scope" or "What was tested". One heading level 1 per page.
- [ ] **Doors.** Move through the doors region. Each door is read as its eyebrow (for example "New to clusters? Start here"), the title as a heading level 3, a one-sentence summary, then a single link whose text says where it goes ("Take the five-minute tour"). The door is not announced as clickable text, and no arrow is spoken.
- [ ] **Badge, collapsed and expanded.** Move to "What this means for you". VoiceOver says it is a disclosure (button) and "collapsed". VO+Space opens it and VoiceOver says "expanded"; the next VO+Right reads the Tested row, then You need, then Depends on your center. A stale or failed badge is read as ordinary text starting "Warning:", not as a disclosure.
- [ ] **Timeline order (modules).** On a learning-module page, VO+Right through the figure: it is announced as a figure with the caption, then a list of 6 items. Each item reads "Step n", the label, then its caption, in order: Get an allocation, Start coordinator, Readiness gate, Run workers, Verify results, Clean up. On Module 2 the lit step is announced as the current step. The decorative bars are not read.
- [ ] **Theme control.** The select is read as "Select theme, pop-up button" with the current value (Auto, Light or Dark). VO+Space opens the list, and choosing a value changes the page at once. The icons are not read.
- [ ] **Crosswalk.** The legend reads as a list of four terms, each with "was ...". The shape marks (square, diamond, triangle, circle) are not spoken. Each pane's caption names the file. The selected term is announced as pressed; the page also tells the reader which lines it affects.
- [ ] **Record page.** The current record is reachable from every badge by a link named "Test record". Its table or list reads label then value.

## C. Real forced colours (Windows, if available)

On Windows 11: Settings, Accessibility, Contrast themes, choose Aquatic, then Night sky. In Edge or Chrome open `/`, a module and the current record.

- [ ] All body text, links and buttons stay readable; no text disappears against its background.
- [ ] Warning notices, the doors and the evidence badge keep a visible border.
- [ ] The current sidebar link and a selected crosswalk term are distinguishable from their neighbours without colour.
- [ ] The focus ring is visible on every control.

## D. Print (Chrome, Cmd+P, "Background graphics" off)

- [ ] The page prints dark text on white, without the header, the sidebar or the "On this page" list. The evidence panel is open and shows the Tested, You need and Depends on your center rows.
- [ ] On learning-module pages the six timeline steps print in order. The concept shapes (square, diamond, triangle, circle) print and carry the meaning in black and white. On home, the hero figure prints as two labelled panels and the four concept rows stay together.
- [ ] Link destinations: external links in the content are identifiable on paper (the URL is printed or the link text names the destination). Record any page where they are not.
- [ ] Closing the print preview leaves the evidence panel in the state it had before.
- [ ] The cheat sheet (`/about/cheat-sheet/`) prints on one Letter page and one A4 page.

## E. Quick extras

- [ ] Reduce motion: macOS Settings, Accessibility, Display, Reduce motion on. Nothing moves in either state; in-page jumps do not animate.
- [ ] Blocked fonts: Chrome DevTools, Network, "Block request URL", pattern `*/fonts/*`, reload. Text stays visible and readable on the fallback fonts and no line overlaps another.
- [ ] 200% zoom: Cmd+Plus until 200%, then 400% on a 1280 px window. No horizontal scrolling for text content; code panes and tables scroll inside their own region.
- [ ] JavaScript off (DevTools, Command menu, "Disable JavaScript"): home shows the hero and its two-environment figure, three doors, the four concept rows, the crosswalk and the closed evidence panel (openable). The narrow menu still opens and closes. The theme select is hidden and the page follows the operating-system theme. Search is unavailable and says nothing misleading.
