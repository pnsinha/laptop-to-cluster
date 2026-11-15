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

Create a focused branch, make the change and its tests, then run the checks below before you open a pull request. Required CI checks must pass. Publication candidates are built once as static output; release promotion must use that retained output rather than rebuilding it.

Install once, with Node.js 22.15 or later:

```sh
npm ci
npx playwright install chromium
```

For any change, run the fast checks:

```sh
npm run check && npm run test:unit && npm run test:property
```

For a change that affects rendered pages, also build the site and run the page and accessibility checks:

```sh
npm run build && npm run test:integration:built && npm run test:accessibility:built && npm run test:accessibility:browser
```

Before a pull request, run the publication validators that work locally:

```sh
npm run validate:built && npm run validate:policy && npm run validate:accessibility-review && npm run validate:evidence && npm run validate:repository && npm run validate:release
```

Do not expect `npm run validate` or `npm run publication:validate` to pass on your machine. Both start with the boundary scan, which needs the `L2C_BOUNDARY_PATTERN` secret that only CI and the maintainer have. CI runs the full set on every pull request from this repository; for a pull request from a fork, the maintainer runs the boundary scan before merging. [`scripts/README.md`](scripts/README.md) says what each check does.

## Privacy and attribution

Do not submit credentials, account/allocation identifiers, private hostnames, sensitive paths, or respondent-identifying feedback. Public feedback summaries are anonymous unless the respondent explicitly approves attribution.
