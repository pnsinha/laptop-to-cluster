/* Learner links to the package that ships with this release are written in content as
   `.../blob/@release/...` and resolved here, at build time, to the current release tag
   (RELEASE_VERSION, else the newest releases/<v>/release-candidate.json). Provenance links
   stay pinned to the release a run used and never carry the token. */
export const RELEASE_REF_TOKEN = '@release';

export function resolveReleaseRef(href, version) {
  return typeof href === 'string' ? href.replaceAll(`/${RELEASE_REF_TOKEN}/`, `/${version}/`) : href;
}

export default function rehypeReleaseRefs({ version }) {
  if (!version) throw new Error('rehypeReleaseRefs: a release version is required');
  const visit = (node) => {
    if (node.type === 'element' && node.tagName === 'a' && node.properties) {
      node.properties.href = resolveReleaseRef(node.properties.href, version);
    }
    for (const child of node.children ?? []) visit(child);
  };
  return () => (tree) => visit(tree);
}
