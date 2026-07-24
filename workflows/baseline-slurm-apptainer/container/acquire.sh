#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
HERE=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
LOCK=${LOCK_FILE:-$HERE/image-lock.json}
OUTPUT=${1:-$HERE/baseline.sif}
APPTAINER_CMD=${BSSW_APPTAINER_CMD:-apptainer}
SHA256_CMD=${BSSW_SHA256_CMD:-sha256sum}
command -v "$APPTAINER_CMD" >/dev/null 2>&1 || {
  printf 'BSSW-PREQ-APPTAINER: Apptainer is required\n' >&2; exit 65;
}
command -v python3 >/dev/null 2>&1 || {
  printf 'BSSW-PREQ-COMMAND: python3 is required to read acquisition metadata\n' >&2; exit 66;
}
IFS=$'\t' read -r SOURCE SOURCE_DIGEST < <(python3 - "$LOCK" "$HERE/Apptainer.def" <<'PY'
import json, pathlib, re, sys
record = json.load(open(sys.argv[1], encoding="utf-8"))
source = record.get("ociSource", "")
digest = record.get("sourceDigest", "")
definition = pathlib.Path(sys.argv[2]).read_text(encoding="utf-8")
if record.get("schemaVersion") != 1 or not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
    raise SystemExit("BSSW-PREQ-IMAGE: invalid acquisition metadata")
if not source.endswith("@" + digest) or digest not in definition:
    raise SystemExit("BSSW-INTEGRITY-IMAGE: definition and OCI metadata are not digest-bound")
print(source, digest, sep="\t")
PY
)
[[ -n "$SOURCE" && -n "$SOURCE_DIGEST" ]] || exit 68
mkdir -p -- "$(dirname -- "$OUTPUT")"
TEMP=${OUTPUT}.partial.$$
trap 'rm -f -- "$TEMP"' EXIT
(
  cd "$HERE"
  "$APPTAINER_CMD" build "$TEMP" Apptainer.def
)
DIGEST_OUTPUT=$("$SHA256_CMD" "$TEMP")
SIF_DIGEST=${DIGEST_OUTPUT%%[[:space:]]*}
[[ "$SIF_DIGEST" =~ ^[0-9a-fA-F]{64}$ ]] || {
  printf 'BSSW-INTEGRITY-IMAGE: invalid SIF digest output\n' >&2; exit 71;
}
chmod 0444 "$TEMP"
mv -f -- "$TEMP" "$OUTPUT"
SIF_DIGEST=$(printf '%s' "$SIF_DIGEST" | tr '[:upper:]' '[:lower:]')
printf '%s  %s\n' "$SIF_DIGEST" "$(basename -- "$OUTPUT")" > "${OUTPUT}.sha256"
printf 'Acquired immutable OCI source and recorded SIF SHA-256.\n'
