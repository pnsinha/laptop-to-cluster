/* Click-to-highlight for the home-page crosswalk. Optional: the static legend
   and both code panes are complete without this file. Native buttons give
   Enter and Space, so there are no key handlers. Lean variant: the
   script only sets data-selected, and CSS lights the matching lines. */
const section = document.querySelector<HTMLElement>('.crosswalk');
const legend = section?.querySelector('dl');
if (section && legend) {
  for (const dt of legend.querySelectorAll('dt')) dt.innerHTML = `<button aria-pressed=false>${dt.innerHTML}</button>`;
  legend.insertAdjacentHTML('afterend', '<p class=crosswalk__status role=status>Select a term to highlight its lines.</p><button class=crosswalk__clear hidden>Show all</button>');
  const status = legend.nextElementSibling!;
  const clear = status.nextElementSibling as HTMLButtonElement;
  // The code panes sit behind a disclosure; a selection opens it so the lit lines are visible.
  const panes = section.querySelector('details');
  let pressed: HTMLElement | null = null;
  section.addEventListener('click', ({ target }) => {
    const button = (target as Element).closest('button');
    if (!button) return;
    const key = button === clear || button === pressed ? '' : button.closest<HTMLElement>('[data-concept]')!.dataset.concept!;
    section.dataset.selected = key;
    if (key && panes) panes.open = true;
    pressed?.setAttribute('aria-pressed', 'false');
    if (key) button.setAttribute('aria-pressed', 'true');
    if (button === clear) pressed?.focus();
    clear.hidden = !key;
    status.textContent = `Showing: ${key ? button.lastChild!.textContent!.trim() : 'all lines'}`;
    pressed = key ? button : null;
  });
}
