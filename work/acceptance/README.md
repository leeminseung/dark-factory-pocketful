# Pocketful acceptance suites

Black-box tests written from the requirement lists (`work/stage-N/requirements.md`). They
drive the running service only through its HTTP API. Each test names the requirement ids it
checks (`@pytest.mark.req(...)`) and quotes the sentence in its docstring.

## Run

```sh
work/acceptance/run.sh <stage-folder> <suite-number> [extra pytest args]
# e.g. from the repository root:
work/acceptance/run.sh stage-1 1
work/acceptance/run.sh /path/to/worktree/stage-1 1 -k settlements
```

The command:

1. creates `work/acceptance/.venv` with pytest and httpx on first use (git-ignored);
2. builds the stage folder's `Dockerfile` under a unique image tag (`pocketful-acc-<time>-<pid>`);
3. starts it as a container of the same unique name with `--cpus 2 --memory 2g`,
   `-e PORT=9137` and a free host port, and waits for `GET /health` (recording the start time);
4. runs suites `tests/stage_1` .. `tests/stage_<suite-number>` against it;
5. for a folder named `stage-K` with K > 1, also builds and starts every earlier sibling folder
   `stage-1` .. `stage-(K-1)`, passing their URLs as `STAGE_<n>_URL` and the last as
   `PREV_BASE_URL` (the upgrade tests import their exports);
6. removes the containers and any extra containers the tests started.

Browser tests (stage 2 on) use Playwright's Chromium; the command installs it on first use.
`ACCEPTANCE_UI_TIMEOUT_MS` (default 8000) sets the per-action browser timeout.

### Validity check

Run a stage's suite against the previous accepted revision, built from a worktree:

```sh
git worktree add --detach ../worktrees/test-designer-<rev> <rev>
ACCEPTANCE_UI_TIMEOUT_MS=1500 work/acceptance/run.sh ../worktrees/test-designer-<rev>/stage-<K-1> <K>
```

Every test of new or changed behaviour must fail there; the results are recorded in
`work/stage-K/requirements.md`.

Output goes outside the repository, to `$ACCEPTANCE_OUT` if set, otherwise
`<repository parent>/acceptance-runs/<run-id>/`: `build.log`, `service.log`, `pytest.log`,
`junit.xml`. The exit status is pytest's.

Requirements: Docker, and `uv` or Python 3.10+. Tests marked `docker` start a second container
of the same image (default port; import into a fresh process).

## Layout

- `run.sh` — the command above.
- `tests/conftest.py` — HTTP client, fixtures in the §4 format, error/timestamp helpers. Every
  5xx fails the test that saw it; each call has the stated 5 s timeout (10 s for reset,
  export and import).
- `tests/stage_N/` — the suite for stage N. `tests/stage_2/s2.py` holds stage-2 helpers
  (authorisation fixtures, money formatting, page helpers).
- `tests/edits.py` — helpers for edited-export tests (find values the test created inside an
  export's opaque state). `tests/stage_3/s3.py` — stage-3 helpers.
- `coverage.py <N>` — fills the Tests column of `work/stage-N/requirements.md` from the markers.
