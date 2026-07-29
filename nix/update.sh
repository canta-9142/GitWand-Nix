#!/usr/bin/env bash

set -euo pipefail

repo_root="$(
  git rev-parse --show-toplevel
)"

cd "$repo_root"

nix run nixpkgs#nix-update -- gitwand --flake
nix flake check
nix build .#gitwand

printf '%s\n' "GitWand package updated successfully."
