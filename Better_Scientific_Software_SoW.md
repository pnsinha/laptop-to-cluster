**Better Scientific Software**
 
**2026 ****BSSw**** Fellowship**
 
**Statement of Work: Project Plan and Milestones**
 
**Period of Performance: **April 1, 2026 – April 30, 2027
 
**Name: **Parmanand Sinha, PhD, Computational Scientist, UChicago
 
# Project Summary
 
Modern research software increasingly runs as multi-service stacks: interactive dashboards backed by databases, queues feeding distributed/GPU-enabled workers or schedulers coordinating parallel computation. These stacks are easy to prototype locally with Docker Compose, but the workflow often breaks on shared HPC systems where Docker is unavailable, and batch schedulers control all resource allocation. This fellowship will help close that "laptop-to-cluster" gap by documenting and teaching HPC-native translation patterns: treating the scheduler allocation as the orchestration boundary; mapping each "service" to a containerized process launched under the scheduler; using readiness checks in place of *depends_on*; binding job-scoped scratch for state and outputs; and using SSH tunneling for interactive access when appropriate.
 
The project output will be organized as a set of portable learning modules published on an externally hosted project site (with a companion public template repository). Module topics are expected to include: (1) scheduler-as-orchestrator patterns for multi-service workflows; (2) Slurm and PBS-family launch templates; (3) Apptainer and Charliecloud runtime patterns and portability boundaries;  (4) an optional cross-site "remote triggering" abstraction pattern using Globus Compute (and, where appropriate, Globus Flows for transfer/trigger/collect) and (5) operational guidance for offering "container-first" environments to users as a way to reduce storage/inode strain often caused by proliferating per-user Conda environments on shared filesystems.
 
The project will be disseminated through community venues and a final BSSw.io blog posts that summarizes outcomes and point users to the full resource site, consistent with fellowship guidance that BSSw.io links out to externally hosted materials.
 
# Milestones
 
## Milestone 1 – Foundation and Baseline Model
 
**Due: **July 31, 2026 | **25%**
 
Description: Establish the public home for project artifacts and deliver the baseline "Compose-to-HPC" translation model with a minimal working reference workflow on a representative HPC configuration. 
 
**Milestone Deliverables:**
 
- Externally hosted project site + public repository created (open license; stable URLs).
 
- Draft content for 1–2 learning modules published on the project site (e.g., "scheduler as orchestrator" + baseline single-node service+workers pattern).
 
- Baseline reference workflow running on one representative environment (e.g., Slurm + Apptainer), with runnable scripts and "getting started" instructions.
 
## Milestone 2 – Portability and Dissemination
 
**Due: **December 15, 2026 | **30%**
 
Description: Expand portability across schedulers/runtimes, and disseminate early results to the HPC community. This milestone will prioritize Slurm and PBS-family scheduler templates and Apptainer/Charliecloud runtime patterns, and will incorporate community feedback gathered through conference/community engagement (e.g., SC26 if accepted and scheduled).
 
**Milestone Deliverables:**
 
- Published content for 1–2 additional modules on the project site (focused on portability patterns across Slurm/PBS and Apptainer/Charliecloud, including documented portability boundaries).
 
- Slurm + PBS-family launch templates for at least one reference workflow, with documented "what varies by center" notes.
 
- Two dissemination engagements delivered (e.g., SC26 tutorial/workshop + BoF if accepted/scheduled; otherwise, equivalent HPC community venues), with materials publicly posted (slides/handouts + repo links).
 
## Milestone 3 – Training and Operational Guidance
 
**Due: **March 1, 2027 | **25%**
 
Description: Convert the work into reusable training modules and publish HPC-center guidance on reducing filesystem/inode pressure via "container-first" approaches (curated images + lightweight wrappers) as an alternative to unbounded per-user Conda sprawl.
 
**Milestone Deliverables:**
 
- Two reusable training modules (slides, labs, instructor notes, and learner handouts) published on the project site.
 
- "Container-first Python on HPC" guidance note: inode/storage best practices and suggested center deployment patterns.
 
- Pilot delivery of at least one training module (virtual or local), with feedback summary and revisions incorporated into materials.
 
## Milestone 4 – Final Release and Reporting
 
**Due: **April 30, 2027 | **20%**
 
Description: Finalize stable releases, complete broad dissemination, and submit the final fellowship report.
 
**Milestone Deliverables:**
 
- Tagged v1.0 repository release with adoption checklist for HPC centers.
 
- HPC Best Practices webinar scheduled and delivered (or delivered and recorded, depending on program format), with materials publicly posted.
 
- 1 BSSw.io blog post submitted/published as a culmination (summary + links to project site/repo).
 
## Milestone Payment Summary
 
| **Milestone** | **Due Date** | **Payment %** |
| --- | --- | --- |
| 1 – Foundation & Baseline Model | July 31, 2026 | 25% |
| 2 – Portability & Dissemination | December 15, 2026 | 30% |
| 3 – Training & Operational Guidance | March 1, 2027 | 25% |
| 4 – Final Release & Reporting | April 30, 2027 | 20% |
| **Total** |  | **100%** |