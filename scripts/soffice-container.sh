#!/usr/bin/env bash
# Build once: docker build -t matter-cockpit-soffice:1 scripts/soffice
# Configure: MATTER_COCKPIT_SOFFICE=scripts/soffice-container.sh
set -euo pipefail
args=("$@")
mounts=()
for ((i=0; i<${#args[@]}; i++)); do
  if [[ ${args[i]} == --outdir ]]; then
    i=$((i+1))
    outdir=$(realpath -- "${args[i]}")
    mounts+=(-v "$outdir:$outdir")
    args[i]=$outdir
  elif [[ -f ${args[i]} ]]; then
    input=$(realpath -- "${args[i]}")
    inputdir=$(dirname -- "$input")
    mounts+=(-v "$inputdir:$inputdir")
    args[i]=$input
  fi
done
# The normalizer places input and output in the same directory; mount it only once.
if [[ ${#mounts[@]} -eq 4 && ${mounts[1]} == "${mounts[3]}" ]]; then
  mounts=("${mounts[@]:0:2}")
fi
exec docker run --rm --network none --user "$(id -u):$(id -g)" \
  -e HOME=/tmp "${mounts[@]}" matter-cockpit-soffice:1 soffice "${args[@]}"
