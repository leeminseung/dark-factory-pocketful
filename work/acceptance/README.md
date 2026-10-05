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
5. removes the container and any extra containers the tests started.

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
- `tests/stage_N/` — the suite for stage N.
