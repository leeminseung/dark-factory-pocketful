#!/bin/sh
# Start a run in a new result repository: commit the mandates, then point every seat's
# working folder and instructions at the repository. Then create a room with the five seats
# and send the stage task (stage-task.md) to the coordinator.
# Usage: start-run.sh <new-result-repository> <folder-with-the-five-mandates>
set -e
R="${1:?new result repository}"
M="${2:?mandates folder}"
test ! -e "$R"
mkdir -p "$R/mandates"
cp "$M"/coordinator.md "$M"/implementer.md "$M"/test-designer.md "$M"/reviewer.md "$M"/product-designer.md "$R/mandates/"
git -C "$R" init -q -b main
git -C "$R" add mandates
git -C "$R" -c user.name=operator -c user.email=operator@localhost commit -qm "Add seat mandates"
for s in coordinator implementer test-designer reviewer product-designer; do
  band runtime template set --session "toy-$s" --spawn-cwd "$R"
  band agent instructions set --session "toy-$s" --instructions-file "$R/mandates/$s.md"
done
