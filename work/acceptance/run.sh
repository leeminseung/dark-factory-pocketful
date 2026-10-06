#!/usr/bin/env bash
# Build a stage folder, start it, and run acceptance suites 1..N against it.
#
#   work/acceptance/run.sh <stage-folder> <suite-number> [extra pytest args...]
#
# Output goes outside the repository: $ACCEPTANCE_OUT (default:
# <repo parent>/acceptance-runs/<run-id>/).
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: $0 <stage-folder> <suite-number> [pytest args...]" >&2
  exit 2
fi

STAGE_DIR="$(cd "$1" && pwd)"
SUITE="$2"
shift 2

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
RUN_ID="pocketful-acc-$(date +%Y%m%d-%H%M%S)-$$"
OUT="${ACCEPTANCE_OUT:-$(dirname "$REPO")/acceptance-runs/$RUN_ID}"
mkdir -p "$OUT"

# Test dependencies live in a git-ignored venv next to this script.
VENV="$HERE/.venv"
if [ ! -x "$VENV/bin/python" ]; then
  if command -v uv >/dev/null 2>&1; then
    uv venv -q "$VENV"
    uv pip install -q --python "$VENV/bin/python" -r "$HERE/requirements.txt"
  else
    python3 -m venv "$VENV"
    "$VENV/bin/pip" install -q -r "$HERE/requirements.txt"
  fi
fi
# keep dependencies current (playwright was added in stage 2) and make sure chromium is present
"$VENV/bin/python" -c 'import playwright' 2>/dev/null || {
  if command -v uv >/dev/null 2>&1; then uv pip install -q --python "$VENV/bin/python" -r "$HERE/requirements.txt";
  else "$VENV/bin/pip" install -q -r "$HERE/requirements.txt"; fi; }
"$VENV/bin/python" -m playwright install chromium >/dev/null 2>&1 || echo "warning: playwright chromium install failed"

free_port() {
  "$VENV/bin/python" -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()'
}

TAG="$RUN_ID:latest"
NAME="$RUN_ID"
PORT="$(free_port)"
INNER_PORT=9137   # deliberately not 8080: proves PORT is honoured

cleanup() {
  docker logs "$NAME" >"$OUT/service.log" 2>&1 || true
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  local ids
  ids="$(docker ps -aq --filter "label=pocketful-acceptance=$RUN_ID")"
  [ -n "$ids" ] && docker rm -f $ids >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "run:    $RUN_ID"
echo "folder: $STAGE_DIR"
echo "output: $OUT"

docker build -q -t "$TAG" "$STAGE_DIR" >"$OUT/build.log" 2>&1 || { cat "$OUT/build.log"; echo "BUILD FAILED"; exit 1; }

START=$("$VENV/bin/python" -c 'import time; print(time.time())')
docker run -d --name "$NAME" --label "pocketful-acceptance=$RUN_ID" \
  --cpus 2 --memory 2g -e PORT="$INNER_PORT" -p "127.0.0.1:$PORT:$INNER_PORT" "$TAG" >/dev/null

BASE_URL="http://127.0.0.1:$PORT"
START_SECONDS=$("$VENV/bin/python" - "$BASE_URL" "$START" <<'PY'
import sys, time, urllib.request
url, start = sys.argv[1], float(sys.argv[2])
while time.time() - start < 90:
    try:
        with urllib.request.urlopen(url + "/health", timeout=2) as r:
            if r.status == 200:
                print(f"{time.time() - start:.2f}")
                sys.exit(0)
    except Exception:
        pass
    time.sleep(0.25)
print("timeout")
sys.exit(1)
PY
) || { echo "service never became healthy"; docker logs "$NAME" | tail -50; exit 1; }
echo "healthy after ${START_SECONDS}s at $BASE_URL"

# Every earlier stage folder next to this one (stage-K -> stage-1 .. stage-(K-1)), for the
# upgrade tests: STAGE_<n>_URL for each, and PREV_BASE_URL for stage-(K-1).
PREV_BASE_URL=""
EARLIER_ENV=()
BASE_NAME="$(basename "$STAGE_DIR")"
if [[ "$BASE_NAME" =~ ^stage-([0-9]+)$ ]] && [ "${BASH_REMATCH[1]}" -gt 1 ]; then
  K="${BASH_REMATCH[1]}"
  for n in $(seq 1 $((K - 1))); do
    PREV_DIR="$(dirname "$STAGE_DIR")/stage-$n"
    [ -d "$PREV_DIR" ] || continue
    docker build -q -t "$RUN_ID-s$n:latest" "$PREV_DIR" >"$OUT/stage-$n-build.log" 2>&1 || { cat "$OUT/stage-$n-build.log"; echo "STAGE-$n BUILD FAILED"; exit 1; }
    P="$(free_port)"
    docker run -d --name "$NAME-s$n" --label "pocketful-acceptance=$RUN_ID" \
      --cpus 2 --memory 2g -e PORT="$INNER_PORT" -p "127.0.0.1:$P:$INNER_PORT" "$RUN_ID-s$n:latest" >/dev/null
    URL="http://127.0.0.1:$P"
    for _ in $(seq 1 240); do
      curl -fsS "$URL/health" >/dev/null 2>&1 && break
      sleep 0.25
    done
    EARLIER_ENV+=("STAGE_${n}_URL=$URL")
    [ "$n" -eq $((K - 1)) ] && PREV_BASE_URL="$URL"
    echo "earlier stage $PREV_DIR at $URL"
  done
fi

DIRS=()
for n in $(seq 1 "$SUITE"); do
  [ -d "$HERE/tests/stage_$n" ] && DIRS+=("$HERE/tests/stage_$n")
done

set +e
env BASE_URL="$BASE_URL" IMAGE_TAG="$TAG" RUN_ID="$RUN_ID" START_SECONDS="$START_SECONDS" \
  STAGE_DIR="$STAGE_DIR" PREV_BASE_URL="$PREV_BASE_URL" ${EARLIER_ENV[@]+"${EARLIER_ENV[@]}"} \
  "$VENV/bin/python" -m pytest -p no:cacheprovider -q -rfE \
    --rootdir "$HERE/tests" -c "$HERE/pytest.ini" \
    --junitxml "$OUT/junit.xml" "${DIRS[@]}" "$@" 2>&1 | tee "$OUT/pytest.log"
STATUS=${PIPESTATUS[0]}
set -e
echo "pytest exit $STATUS; log: $OUT/pytest.log"
exit "$STATUS"
