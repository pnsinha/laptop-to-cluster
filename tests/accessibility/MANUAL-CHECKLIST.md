# Manual accessibility checks for a release

The scanner (`npm run test:accessibility:browser`) automates what a script can prove: axe in both schemes, token contrast, keyboard order and focus rings, reflow at 320/768/1280 px and 200% zoom, forced-colors and print emulation, JavaScript off, blocked fonts, theme precedence, and reduced motion. The checks below need a person with a keyboard and a screen reader. Record each result in `releases/<version>/accessibility-review.yml`.

## Set up

1. `npm run build`, then `npx astro preview --root site --port 4321`.
2. Open `http://localhost:4321/` in Chrome and Safari. Pages to cover: `/`, `/guide/tour/`, `/guide/baseline-single-node-pattern/`, the current record under `/applicability/`, `/adoption/evaluate/`.
3. macOS: System Settings, Keyboard, turn on "Keyboard navigation" so Safari tabs to every control. Turn VoiceOver on and off with Cmd+F5. The VoiceOver modifier (VO) is Control+Option.

## A. Keyboard pass (Chrome, no mouse)

Start each page by clicking the address bar, then press Tab. Tick a box only if the behaviour is exactly as described.

- [ ] **Skip link.** First Tab shows "Skip to content" with a visible ring. Enter moves focus into `main`; the next Tab lands on the first control inside the page content, not back in the header.
- [ ] **Header navigation, wide.** Tab visits Get started, Guide, Troubleshooting, About, GitHub (external), in that order, then the theme control. The current page's link has a mark that is not only colour. Enter follows the link.
- [ ] **Header navigation, narrow.** Resize the window to 320 px wide. Tab to "Navigation", press Enter or Space: the menu opens, focus stays on "Navigation", the next Tab lands on Get started. Shift+Tab then Enter closes it. No horizontal scrollbar at any point.
- [ ] **Theme control.** Tab to System, Light, Dark. Press Space or Enter on Dark: the page turns dark at once and Dark is marked pressed; reload keeps it. Press System: the page follows the operating-system setting again. The ring is visible on each button in both themes.
- [ ] **Hero actions (home).** The filled primary action, the Compose link and the quiet evaluation link are each one Tab stop with a visible ring. Enter on "Start with the big idea" moves the view to the big-idea section and the next Tab continues from there. The hero figure has no Tab stops.
- [ ] **Evidence badge and panel.** Tab to "What this means for you". Enter or Space opens it; the three rows (Tested, You need, Depends on your center) appear; "What hasn't been tested yet" is the next Tab stop. Enter or Space on the summary closes it again; focus stays on the summary.
- [ ] **Timeline (modules).** On learning-module pages there is no Tab stop inside the timeline. The six steps read in order when you scroll.
- [ ] **Doors (home).** Exactly three Tab stops, one link per door, in the order Understand, Translate, Evaluate and adopt. Enter on each goes to its page. There is no hover-only content.
- [ ] **Concept rows (home).** Five Tab stops in the big-idea section, in order: the allocation link in the introduction, then one glossary link per row (job step, readiness gate, job-scoped scratch, loopback). No other Tab stops in the section.
- [ ] **Crosswalk (static).** The legend has no Tab stops. Each code pane that scrolls sideways takes one Tab stop with a visible ring and scrolls with the arrow keys; Tab then leaves it (no keyboard trap). If the highlight enhancement ships: each legend term is a button, Space selects one, a second Space clears it, and the selection is also shown by an outline, not only colour.
- [ ] **Pager and Sources.** The previous and next links are ordinary links. The Sources disclosure opens and closes with Enter or Space.
- [ ] **Footer.** Tab visits Attribution, Talks & papers, Accessibility, Support, Licenses, GitHub (external). The acknowledgment text is plain text, not a link.
- [ ] **Order.** On each page, the Tab order follows the reading order top to bottom with no jumps backwards.

## B. VoiceOver spot check (Safari, VoiceOver on)

Use VO+Right to move item by item and VO+U for the rotor (Headings, Landmarks, Links).

- [ ] **Landmarks.** Rotor, Landmarks: banner, navigation "Primary", main, navigation "Site records", contentinfo. Pages with a trail also list navigation "Breadcrumb". Learning modules also list navigation "Learning module navigation" and the regions "Tested workflow scope" or "What was tested". One heading level 1 per page.
- [ ] **Doors.** Move through the doors region. Each door is read as its eyebrow (for example "New to clusters? Start here"), the title as a heading level 3, a one-sentence summary, then a single link whose text says where it goes ("Take the five-minute tour"). The door is not announced as clickable text, and no arrow is spoken.
- [ ] **Badge, collapsed and expanded.** Move to "What this means for you". VoiceOver says it is a disclosure (button) and "collapsed". VO+Space opens it and VoiceOver says "expanded"; the next VO+Right reads the Tested row, then You need, then Depends on your center. A stale or failed badge is read as ordinary text starting "Warning:", not as a disclosure.
- [ ] **Timeline order (modules).** On a learning-module page, VO+Right through the figure: it is announced as a figure with the caption, then a list of 6 items. Each item reads "Step n", the label, then its caption, in order: Get an allocation, Start coordinator, Readiness gate, Run workers, Verify results, Clean up. On Module 2 the lit step is announced as the current step. The decorative bars are not read.
- [ ] **Theme control.** Each button is read as "System, button, pressed" or "Light, button, not pressed" (wording varies by macOS version), and the pressed state changes after VO+Space.
- [ ] **Crosswalk.** The legend reads as a list of four terms, each with "was ...". The shape marks (square, diamond, triangle, circle) are not spoken. Each pane's caption names the file. If the highlight enhancement ships: the selected term is announced as pressed; the page also tells the reader which lines it affects.
- [ ] **Record page.** The current record is reachable from every badge by a link named "Test record". Its table or list reads label then value.

## C. Real forced colours (Windows, if available)

On Windows 11: Settings, Accessibility, Contrast themes, choose Aquatic, then Night sky. In Edge or Chrome open `/`, a module and the current record.

- [ ] All body text, links and buttons stay readable; no text disappears against its background.
- [ ] Warning notices and the evidence badge keep a visible border.
- [ ] The pressed theme button and the current navigation link are distinguishable from their neighbours without colour.
- [ ] The focus ring is visible on every control.

## D. Print (Chrome, Cmd+P, "Background graphics" off)

- [ ] The page prints dark text on white. The evidence panel is open and shows the Tested, You need and Depends on your center rows.
- [ ] On learning-module pages the six timeline steps print in order. The concept shapes (square, diamond, triangle, circle) print and carry the meaning in black and white. On home, the hero figure prints as two labelled panels and the four concept rows stay together.
- [ ] Link destinations: external links in the content are identifiable on paper (the URL is printed or the link text names the destination). Record any page where they are not.
- [ ] Closing the print preview leaves the evidence panel in the state it had before.

## E. Quick extras

- [ ] Reduce motion: macOS Settings, Accessibility, Display, Reduce motion on. Nothing moves in either state; in-page jumps do not animate.
- [ ] Blocked fonts: Chrome DevTools, Network, "Block request URL", pattern `*/fonts/*`, reload. Text stays visible and readable on the fallback fonts and no line overlaps another.
- [ ] 200% zoom: Cmd+Plus until 200%, then 400% on a 1280 px window. No horizontal scrolling for text content; code panes and tables scroll inside their own region.
- [ ] JavaScript off (DevTools, Command menu, "Disable JavaScript"): home shows the hero and its two-environment figure, three doors, the four concept rows, the crosswalk and the closed evidence panel (openable). The theme control is hidden and the page follows the operating-system theme.
