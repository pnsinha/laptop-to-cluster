// Shared fixture: a minimal .github/workflows/release.yml that satisfies the A11 contract.
const gh = (text: string) => text.replaceAll('@{{', '${{');
export const RELEASE = gh(`name: release
on:
  push:
    branches: [v0.2.0-showcase]
    tags:
      - 'v[0-9]+.[0-9]+.[0-9]+'
      - 'v[0-9]+.[0-9]+.[0-9]+-rc.[0-9]+'
      - '!v0.1.0'
permissions:
  contents: read
env:
  L2C_BOUNDARY_PATTERN: @{{ secrets.L2C_BOUNDARY_PATTERN }}
jobs:
  plan:
    runs-on: ubuntu-24.04
    outputs:
      version: @{{ steps.v.outputs.version }}
      preview: @{{ steps.v.outputs.preview }}
      mode: @{{ steps.v.outputs.mode }}
      artifact-name: @{{ steps.v.outputs.artifact-name }}
      record-artifact-name: @{{ steps.v.outputs.record-artifact-name }}
    steps:
      - id: v
        run: echo "RELEASE_VERSION=v0.2.0 RELEASE_DATE=x PREVIEW=1"
  build-once:
    needs: plan
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4.2.2
        with: { fetch-depth: 0 }
      - run: npm ci --ignore-scripts
      - run: npm run validate
      - uses: actions/upload-artifact@v4.6.2
        with:
          name: @{{ needs.plan.outputs.artifact-name }}
          path: site/dist/
  deploy-preview:
    if: needs.plan.outputs.mode == 'preview'
    needs: [plan, build-once]
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/download-artifact@v4.3.0
        with:
          name: @{{ needs.plan.outputs.artifact-name }}
      - run: node scripts/publication.mjs verify site/dist publication/artifact-manifest.json
      - uses: cloudflare/wrangler-action@v3.14.1
        env:
          CLOUDFLARE_API_TOKEN: @{{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: @{{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        with:
          command: pages deploy site/dist --project-name=@{{ vars.CLOUDFLARE_PAGES_PROJECT }} --branch=preview --commit-dirty=false
  deploy:
    if: needs.plan.outputs.mode == 'production'
    needs: [plan, build-once]
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/download-artifact@v4.3.0
        with:
          name: @{{ needs.plan.outputs.artifact-name }}
      - run: node scripts/publication.mjs verify site/dist publication/artifact-manifest.json
      - uses: cloudflare/wrangler-action@v3.14.1
        env:
          CLOUDFLARE_API_TOKEN: @{{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: @{{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          CLOUDFLARE_ZONE_ID: @{{ secrets.CLOUDFLARE_ZONE_ID }}
          CF_CUSTOM_DOMAIN_ID: @{{ vars.CLOUDFLARE_CUSTOM_DOMAIN_ID }}
          CF_REDIRECT_LIST_ID: @{{ vars.CLOUDFLARE_REDIRECT_LIST_ID }}
          CF_REDIRECT_RULE_ID: @{{ vars.CLOUDFLARE_REDIRECT_RULE_ID }}
        with:
          command: pages deploy site/dist --project-name=@{{ vars.CLOUDFLARE_PAGES_PROJECT }} --branch=main --commit-dirty=false
      - name: Release record
        run: node scripts/generate-release-record.mjs .
      - name: Recovery index
        run: node scripts/update-recovery-index.mjs a b
      - uses: actions/upload-artifact@v4.6.2
        with:
          name: @{{ needs.plan.outputs.record-artifact-name }}
          path: releases/
  post-deploy-release-checks:
    needs: [deploy-preview, deploy]
    if: always()
    runs-on: ubuntu-24.04
    steps:
      - run: node scripts/check-public-release.mjs
`);
