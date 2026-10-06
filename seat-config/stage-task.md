# Stage task template

The human sends one message per stage to the coordinator, with a mention, and nothing else
during the stage. Fill the angle brackets; keep the wording. For stage 1, use the first
variant of the second sentence group; for later stages, the second.

```text
Build this service one stage at a time. The result repository is `<result repository>` (branch main). It already holds `mandates/`, which belongs to no stage; leave it as it is. Stage <N> goes in `stage-<N>/`. <Stage 1: "Later stages will arrive in separate messages." | Later stages: "Stage <N-1> was accepted at revision <full 40-character revision>; start `stage-<N>/` from that revision's `stage-<N-1>/` and extend it to the stage <N> specification below."> Every stage folder must still pass all earlier stages. Put the source files, a Dockerfile and RUN.md in the stage folder. The band's working records (requirement lists, the glossary, decisions, design direction, acceptance tests and reports) go in `work/`. Commit nowhere else. Temporary worktrees go in <worktrees folder>. Have the reviewer check the stage, and post the full committed revision in the room when it is accepted.

This message covers stage <N> only. Its complete specification is below. <Stage 1: "The same text is on disk, read-only, at <spec folder>/stage-1.md; read it there if anything below looks garbled. The supplied checks for stage 1 are in <challenge package>/<track>/test/stage_1/; read only those." | Later stages: "The requirement files are on disk, read-only: <spec folder>/stage-1.md through stage-<N>.md (this stage builds on the earlier ones). The supplied checks for each stage are in <challenge package>/<track>/test/stage_<number>/; read only those for this stage and earlier ones.">

How to run the checks (Docker is running on this machine):
cd <challenge package> && .venv/bin/python -m harness run --track <track> --repo <the repository or a clean worktree> --stage <N> --out <checks folder>/<a-new-directory-name>
The output directory must not exist yet. Use `--all` instead of `--stage <N>` to check every stage folder at once. The reviewer's final check must add `--mode isolated`, because that is how judging runs (no network, 2 CPUs, 2 GiB). For stage <N>, a correct folder prints <what the supplied checks print for a correct folder at this stage>.

--- stage <N> specification ---
<the stage specification, pasted in full>

---
```
