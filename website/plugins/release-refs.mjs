import { defineMdastPlugin } from 'satteri';
import { resolveReleaseVersion } from '../scripts/publication.mjs';

/* Content writes the current release as the word `@release`: in links to the package that ships
   with it (`.../blob/@release/...`), in commands (`git clone --branch @release`) and in text. This
   plugin swaps in the release the site is built for (RELEASE_VERSION, else the
   version in package.json). Words that merely contain it are left alone, and
   provenance links pinned to an older release are not touched. */
export const RELEASE_REF_TOKEN = '@release';
const STANDALONE = /(?<![\w@/-])@release(?![\w/-])/g;

export function resolveReleaseRefs(value, version) {
  if (!version) throw new Error('resolveReleaseRefs: a release version is required');
  return value.replaceAll(`/${RELEASE_REF_TOKEN}/`, `/${version}/`).replace(STANDALONE, version);
}

/** The release the site is built for. `root` is the website/ folder. */
export const currentRelease = (root = '.') => resolveReleaseVersion(root);

export const releaseRefs = defineMdastPlugin({
  name: 'l2c-release-refs',
  text(node, ctx) { if (node.value.includes(RELEASE_REF_TOKEN)) ctx.setProperty(node, 'value', resolveReleaseRefs(node.value, currentRelease())); },
  inlineCode(node, ctx) { if (node.value.includes(RELEASE_REF_TOKEN)) ctx.setProperty(node, 'value', resolveReleaseRefs(node.value, currentRelease())); },
  code(node, ctx) { if (node.value.includes(RELEASE_REF_TOKEN)) ctx.setProperty(node, 'value', resolveReleaseRefs(node.value, currentRelease())); },
  link(node, ctx) { if (node.url.includes(RELEASE_REF_TOKEN)) ctx.setProperty(node, 'url', resolveReleaseRefs(node.url, currentRelease())); },
});
