#!/usr/bin/env bash
# One time: add the sub-systems as git submodules under systems/.
# Relative URLs, so they follow wherever NeatSystem is cloned from (NeatTeam1943 on GitHub).
#   bash scripts/add-systems.sh && git commit -m "Add sub-systems as submodules"
# MoneyTeam is pinned only so CI can check its auth-js version against ours;
# NeatSystem never builds or changes it.
set -euo pipefail
cd "$(dirname "$0")/.."
add() { [[ -e "systems/$2" ]] && { echo "systems/$2 already there"; return; }; git submodule add -b main "../$1.git" "systems/$2"; }
add StudentTracker trainings
add NeatHub neathub
add MoneyTeam moneyteam
git submodule update --init --recursive
git status --short
