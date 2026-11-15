# Releases

`recovery-index.json` names the current and previous known-good deployments by checksum. The release workflow copies it into the release record and updates the copy with `scripts/update-recovery-index.mjs`; after a release, commit the updated copy here. See [`RECOVERY.md`](../RECOVERY.md).

What shipped in a release is in its git tag and its GitHub Release, and the "Release vX.Y.Z" section of the site's milestone page lists the changes. To cut a release, see "Releasing" in [`MAINTENANCE.md`](../MAINTENANCE.md).
