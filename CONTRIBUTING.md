# Contributing

Contributions to content, workflows, accessibility, and portability are welcome. By contributing, you agree to the Code of Conduct and license your contribution under the category license in `artifact-inventory.yml`.

## Before opening a change

1. Open or link an issue that identifies the affected artifact and scope.
2. For a technical defect, report environment/center, scheduler and version, container runtime and version, relevant software versions, exact commands, sanitized inputs, expected result, observed result, exit status, and logs with secrets removed.
3. Label accessibility barriers and portability observations through their dedicated issue forms.
4. Keep content URLs and metadata names stable; explain any proposed compatibility impact.

## Content ownership and review

The project maintainer owns final publication decisions. Each change needs a scope-aware review: technical changes require reproducibility evidence, content changes require source/authority and link review, and UI changes require keyboard and structure review. A contributor may not approve their own release-affecting change.

## Publication workflow

Create a focused branch, make the change and tests, run `npm ci` and `npm run validate`, then open a pull request. Required CI checks must pass. Publication candidates are built once as static output; release promotion must use that retained output rather than rebuilding it.

## Privacy and attribution

Do not submit credentials, account/allocation identifiers, private hostnames, sensitive paths, or respondent-identifying feedback. Public feedback summaries are anonymous unless the respondent explicitly approves attribution.
