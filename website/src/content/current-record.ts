/* The test record the site presents as the current one: the Tested badges on the home page, Module 2
   and the evaluation guide, the "Test record" links, and the sidebar entry all read it from here.
   A page that cites a specific record (a milestone page, a dated note such as "the October 2026
   test") keeps that record's id written out. A new record becomes current by changing this id. */
export const CURRENT_RECORD_ID = 'm2-baseline-anvil-2026-10';

/** The current record's page. */
export const CURRENT_RECORD_PATH = `/applicability/${CURRENT_RECORD_ID}/`;
