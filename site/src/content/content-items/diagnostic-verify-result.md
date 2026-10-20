---
id: BSSW-VERIFY-RESULT
stable_slug: bssw-verify-result
title: "The results failed verification"
summary: "Find out why the results were rejected and why no success file was written."
artifact_type: diagnostic
topics: [diagnostics, verification]
keywords: [verification, results, result.json, expected]
audiences: [HPC learners]
milestone: 2
status: published
publication_date: "2026-10-20"
schedulers: [slurm]
related: [start-guide, module-2-baseline]
---
## Signal
The job prints `BSSW-VERIFY-RESULT` and exits with code 77. The result schema, the count, the uniqueness, or the content did not pass verification, or the verifier did not create `result.json`. No success file is left behind.

## Likely causes
A worker produced a wrong or missing result, `expected/results.json` no longer matches your input or application, or the verifier is still the demonstration one after you changed the application.

## Recovery steps
1. Read `logs/verification.log` in the run folder.
2. Compare `results.json` with `expected.json` in the same folder.
3. If you changed the application, replace `bin/verify.py` and `expected/results.json` with your own definition of correct.

**Warning:** Do not create `result.json` by hand. It is the only success marker.

## Verify the recovery
A new run writes `result.json` with `"status": "success"`.

## Escalate
Report the sanitized verification log through [support](/about/support/).
