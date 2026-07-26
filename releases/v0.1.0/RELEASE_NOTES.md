# v0.1.0 — Milestone 1

## Added
- Two completed learning modules: Scheduler as Orchestrator and Baseline Pattern: Single-Node Service + Workers.
- The bounded Slurm + Apptainer reference workflow, getting-started path, and durable diagnostic guidance.
- Public repository, executable/content licenses, provenance declarations, attribution, accessibility statement, and support/recovery paths.
- Apex-only static discovery output, blocking publication gates, build-once Direct Upload records, and versioned hostname redirect policy.

## Validation boundary
The runnable workflow is validated on the representative environment (Purdue Anvil, Slurm 25.11.1, Apptainer 1.4.3). Checksum-verified success evidence (job 19500029, `COMPLETED` exit 0) and readiness-timeout evidence (job 19500688, `FAILED` exit 75, no worker-start) are recorded under `evidence/anvil-v0-1-0-*`; the applicability record `m1-baseline-anvil` carries `status: validated`. Local and fake-runtime checks remain distinct from this representative-environment claim.

## Publication binding
`npm run publication:prepare` binds the source commit, immutable `v0.1.0` repository tag, URL-manifest checksum, complete-artifact checksum, and per-file-manifest checksum. The Direct Upload job adds the externally issued Cloudflare deployment ID and assigned noncanonical `*.pages.dev` recovery URL; publication is blocked if either is absent or inconsistent.
