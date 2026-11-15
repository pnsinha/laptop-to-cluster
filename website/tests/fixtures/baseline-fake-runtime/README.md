# Deterministic baseline fake runtime

`run-scenario.sh` supplies fake Slurm, Apptainer, process, monotonic-timeout, and
job-filesystem boundaries. It never starts a container or claims cluster validation.
Supported scenarios are `success`, `invalid-input`, `early-coordinator-exit`,
`worker-failure`, `checksum-mismatch`, `verification-failure`, `cleanup-failure`,
and `readiness-timeout`.

Each run uses a private job-scoped directory, preserves separate coordinator,
readiness, worker, verification, and diagnostic logs, and prints only the fixture
runtime path. Diagnostic messages intentionally exclude account names, hostnames,
tokens, input payloads, and source paths.
