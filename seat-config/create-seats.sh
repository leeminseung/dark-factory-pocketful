#!/bin/sh
# Create the five seats in Band Desktop. Run once, after the seats' config folder
# (~/.claude-seat) holds a Claude login, settings.json and the skills.
# Usage: create-seats.sh <result-repository>   (the repository must hold mandates/<seat>.md)
# Our seats were first created for the toy practice track, hence the session names
# toy-<seat>; any names work.
set -e
REPO="${1:?result repository}"
W="${FACTORY_WORKSPACE:-$HOME/dark-factory}"
DENY=""
for t in SendMessage ListAgents WebSearch WebFetch Workflow DesignSync CronCreate CronDelete CronList ScheduleWakeup EnterWorktree ExitWorktree EnterPlanMode ExitPlanMode; do
  DENY="$DENY --claude-disallowed-tool $t"
done
for seat in coordinator implementer test-designer reviewer product-designer; do
  band agent create \
    --session "toy-$seat" --name "$seat" \
    --cwd "$REPO" \
    --transport claude-code-cli \
    --spawn-command "$W/seat-config/bin/claude-seat-$seat" \
    --runtime-auth inherit --runtime-model claude-opus-5-5 \
    --claude-context-mode local_config --claude-strict-mcp-config --no-spawn-sandbox \
    $DENY \
    --instructions-file "$REPO/mandates/$seat.md"
done
