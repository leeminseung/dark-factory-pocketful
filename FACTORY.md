# The factory

A band of five Claude Code seats in Band Desktop that turns a staged specification into a
working, reviewed service. After the human dispatches a stage, the seats split the work, check
each other and decide when the stage is done, with no further human input. The mandates name
no track: an earlier version of them built a stage of the other track without edits.

This file is enough to stand the factory up: the seats and what each one owns, how a stage
runs, how bad work is caught, the setup, what it cost, and what we tried that did not work.

## Results

| Run | Track | Stages | Time | Model spend (API-equivalent) | Human messages after each task |
|---|---|---|---|---|---|
| Submitted run (this repository) | pocketful | 4 of 4 | 9 h 59 min | $207 | 0 |
| Development run 3 | pocketful | 4 of 4 | 8 h 49 min | about $165 | 2 recovery messages (Band delivery, see Platform workarounds) |
| Genericity check | tablekeeper | 1 (all we ran) | 1 h 40 min | not measured | 0 |
| Baseline: the official minimal mandates, 3 seats | pocketful | 4 of 4 | 2 h 2 min | $38 | 0 |

In the submitted run the human sent the four stage tasks and nothing else: no recovery
message, no stall, and no change to the mandates, skills or hooks while it ran. On a clean
clone of the accepted stage 4 revision, the supplied checks in isolated mode credit every
`stage-N/` folder with stage N.

Model spend is computed from the seats' session logs at Opus 5.5 list prices. The seats ran on a
subscription, so nothing was billed per token.

## Why the factory has this shape

- **Whoever builds never accepts.** The implementer writes the product. The test-designer turns
  the requirements into black-box acceptance tests without reading the product's code. The
  reviewer gives the verdict. The product-designer owns the screens. The coordinator routes
  work, settles disputes from the requirement text and decides when to stop.
- **Discovery runs in fresh context.** A reader who has already seen the code tends to find what
  it expects. Every review pass therefore runs in a new subagent that holds nothing but a
  written brief, and the reviewer keeps only the verified findings.
- **The requirement list is the contract.** The test-designer gives every testable sentence an
  id (such as `S2-014`). Tests, commits, findings and rulings all cite those ids, so a reader
  can follow any change from the room to the code.
- **The loop stops on evidence.** After each round the coordinator counts failing requirement
  ids and blocking screen findings. The loop continues only while that count falls, so it
  cannot circle forever, and whatever is left open is recorded.
- **The final review checks what judging checks.** It runs the supplied checks on every stage
  folder in isolated mode, probes the running build, and reviews every commit made since the
  first review.
- **Rules that matter are enforced, not only written.** Hooks stop a seat from writing or
  committing another seat's files, rewriting history, or asking the human anything mid-run.
- **Craft lives in skills; the mandates hold the process.** Engineering principles, edge cases,
  design craft and a library of real design systems are skills that seats and their subagents
  load, so the mandates stay short and the same craft reaches every pass.
- **Design is anchored in human work.** Three concepts are planned in parallel, each from a
  different real design system and surface, and a blind pass chooses. It rejects the palettes
  models fall back on and screens that read as one flat tone.
- **Mistakes become cases.** A defect that passed the acceptance tests but was caught later by
  review is written down as a case to try, at two levels. The **case memory** belongs to one
  run: at each acceptance the coordinator adds the stage's cases to `work/case-memory.md`, and
  the next stage reads it first. The **case library** spans runs: after a run, a person promotes
  the cases that can be stated without any product's terms into the edge-cases skill
  (`references/case-memory.md`), so a run on any product starts with them.

The engineering principles come from books human teams use: one gate per invariant (Evans,
*Domain-Driven Design*), one module per decision and designing it twice (Ousterhout, *A
Philosophy of Software Design*), retries, concurrency and half-finished operations as the
normal case (Kleppmann, *Designing Data-Intensive Applications*), pinning behaviour before a
change (Feathers, *Working Effectively with Legacy Code*), code smells by Fowler's names
(*Refactoring*), small commits with one purpose (*Software Engineering at Google*), tests as the
specification's own examples (Adzic, *Specification by Example*) and one owner per decision
(Brooks, *The Mythical Man-Month*). Each principle in the skill ends with what a reviewer
reports when it is broken.

## Seats and ownership

| Seat | Owns | Writes |
|---|---|---|
| coordinator | the stage plan, routing, rulings, when the loop stops, acceptance | `work/stage-N/decisions.md`, `work/case-memory.md` |
| implementer | the product code and its structure | `stage-N/`, `work/stage-N/notes.md`, `work/reviews/implementer-*` |
| test-designer | the requirement list, the glossary, the acceptance tests | `work/stage-N/requirements.md`, `work/glossary.md`, `work/acceptance/`, `work/reviews/acceptance-*` |
| reviewer | the code review, the supplied checks over the whole chain, the verdict | `work/reviews/review-*` |
| product-designer | the design direction and the screen review | `work/design.md`, `work/reviews/design-*`, `work/reviews/screens/` |

Every seat is Claude Code with Opus 5.5 in auto permission mode. The mandates are in
`mandates/`, one per seat. `mandates/`, `FACTORY.md`, `README.md`, `room.json` and
`seat-config/` belong to no seat.

## A stage, step by step

1. The human dispatches the stage task to the coordinator: the complete specification, the
   repository, the previous stage's accepted revision and the command for the supplied checks.
2. The coordinator hands the stage to the implementer, the test-designer and, when the stage
   has screens, the product-designer at once. Every handoff carries the whole task, split into
   numbered parts when it is long.
3. The test-designer writes the requirement list. The coordinator reads the specification
   itself and sends back every rule the list misses.
4. When a stage first introduces screens, the product-designer runs three concept passes in
   parallel, each anchored on a different reference design system and surface (light, dark,
   colour-led), then a blind selection pass, and writes `work/design.md` from the chosen
   concept. Working screens first read as products of their category; the sign-up and log-in
   screens are the product's front door.
5. The implementer builds the parts without screens first, then the screens, and reports a
   committed revision with its own test results.
6. A round checks one revision. The test-designer runs the acceptance suite; the
   product-designer reviews the screens; in round 1 the reviewer runs a standards pass and a
   spec pass, each in a fresh subagent. Findings go back to the implementer in one message.
7. The coordinator continues while the count of failing ids and blocking screen findings
   falls, then sends the revision to final review: the supplied checks on the whole chain in
   isolated mode, a fix-commit pass over everything changed since round 1, and a black-box
   probe of the running build.
8. On a pass, the coordinator writes the retro, adds the stage's cases to the case memory,
   checks that the stage folders at HEAD equal the accepted revision, and reports that revision.
9. The next stage's handoffs carry each seat's watch items and every open finding forward.

## How the factory catches bad work

In the submitted run the final review sent every stage back, with 9, 7, 7 and 1 blocking
findings, and the round-1 code reviews had raised 1, 2, 3 and 1 more. All 31 were fixed before
acceptance; the baseline factory's review stopped one defect in four stages. Examples:

- **Stage 1.** The final review found that amounts a hair away from an integer
  (1.0000000000000001) and integers just above 2^53 were rounded instead of refused, that an
  export with out-of-range timestamps was imported and then broke later reads and writes, and that a reset with a large fixture
  of distinct passwords could exceed its time limit. After the fixes, the test-designer's probe
  found the reset still too slow at 1,000 users, and one more round fixed it.
- **Stage 2.** The round-1 review found that a payment form edited and changed back after a
  confirmed payment replayed the old payment instead of sending a new one. The final review
  found, among others, a list that could show a row twice while another client wrote between
  page reads, and receipts that could be edited in an export and still imported.
- **Stage 3.** The final review found that several writes in the same millisecond could come
  back out of creation order, which made the supplied stage 3 check fail now and then in
  isolated mode, and that sub-millisecond times were truncated so a correction could count
  before it happened.
- **Stage 4.** All 1143 acceptance tests passed. The final review's black-box probe then moved
  an operator's settlement receipt to a non-operator in an export: the import accepted it, and
  the operator's retry ran the settlement a second time. The fix went into all four stage
  folders, and the coordinator ruled that a receipt moved between two operators describes a
  valid state, recorded as a risk.

Each of these became a case in the run's `work/case-memory.md`, which grew to 7, 13, 18 and 20
cases after stages 1 to 4. The stage 4 probe came straight from a stage 2 case about edited
receipts, tried on the routes stage 4 added. This run started with 20 cases in the case library,
promoted from earlier runs in the same way.

## Setup

We ran Band Desktop 0.4.12 and Claude Code 2.1.284 on macOS, with Docker for the supplied
checks. Everything below is in `seat-config/`; the commands assume the workspace
`~/dark-factory` (set `FACTORY_WORKSPACE` to use another) holding the challenge package,
`seat-config/` and the result repositories.

1. **Seat config folder.** The seats run Claude Code with their own config folder,
   `~/.claude-seat`, signed in to Claude once. Copy `seat-config/settings.json` into it: it
   turns off auto memory and connectors and registers the three hooks. Copy
   `seat-config/skills/` to `~/.claude-seat/skills/`.
2. **Launchers.** `seat-config/bin/claude-seat-<seat>` starts Claude Code with that config
   folder and a git identity named after the seat, so every commit shows which seat made it.
3. **Seats.** `seat-config/create-seats.sh <result repository>` creates the five seats with
   `band agent create`: the launcher as spawn command, model `claude-opus-5-5`, context mode
   `local_config`, strict MCP config, the seat's mandate as its instructions, and tools a seat
   does not need disallowed (web search, scheduling, plan mode and others).
4. **Hooks.** `seat-config/hooks/` holds three PreToolUse hooks and their configuration:
   - `guard-git.py` blocks history rewrites and merges.
   - `guard-paths.py` lets each seat write and commit only the paths `ownership.json` gives
     it, and keeps the challenge package and the shared skills read-only.
   - `guard-scope.py` keeps seats out of folders outside the work (list yours in
     `private-paths.txt`, see the example), stops questions to the human, runs subagents in
     the foreground and lets a seat post to its own room as itself.
5. **A run.** `seat-config/start-run.sh <new result repository> <mandates folder>` commits the
   mandates in a fresh repository and points every seat's working folder and instructions at
   it. Create a room with the five seats and send each stage's task to the coordinator,
   written from `seat-config/stage-task.md`, one message per stage.

## Costs and time

The submitted run, pocketful, measured from the room and the seats' session logs:

| Stage | Time | Model spend | Rounds | Final review |
|---|---|---|---|---|
| 1 | 1 h 52 min | $35.3 | 4 | rejected (9 blocking), then passed |
| 2 | 3 h 14 min | $72.0 | 4 | rejected (7 blocking), then passed |
| 3 | 2 h 21 min | $58.5 | 3 | rejected (7 blocking), then passed |
| 4 | 2 h 30 min | $40.8 | 3 | rejected (1 blocking), then passed |

By seat: implementer $88.2, reviewer $44.9 (of which $22.1 for its review subagents),
test-designer $41.9, product-designer $17.6, coordinator $14.0. Most of the spend is cached
context read again on every turn: 628 million tokens, about $126.

Against the baseline factory this costs about five times the time and money. In return, every
seat committed (262 seat commits against the baseline's 6, 123 of them by seats other than the
implementer), and the work was sent back and fixed in every stage instead of once.

The design step, from the stage task to a committed direction with three concepts and a blind
selection, took about 14 minutes in the submitted run (stage 2).

## What we tried that did not work

- **The official minimal mandates with three seats.** Fast and cheap, and it passed the shipped
  checks. But every review was one pass in the reviewer's own context, review changed the work
  once in four stages, and defects in areas the shipped checks never ask about stayed to the
  end.
- **A design direction written by one seat alone.** The screens came out safe and monotone,
  cream with a serif.
- **Design rules copied into the mandate.** They covered only part of the craft. We replaced
  them with the frontend-design skill itself and a short design-craft skill.
- **Three concepts seeded from an object, a material and a place.** The concepts became
  literal metaphors (pockets, stitches, cloth) with the colours of their material, and the
  blind pass kept choosing the metaphor closest to the product's name. Two prototypes in a row
  read as one flat tone (one hue family on about 92% of the screen, the accent on 2 to 6%), in
  the warm beige and brown family that taste-skill lists as a common sign of AI-made design.
  Our own screen rubric scored them 84.2 and 88.4 and a person rejected both, so we added the
  composition and fallback-palette checks to the rubric too. Concepts are now anchored on real
  design systems (awesome-design-md) and judged as working screens first, following
  impeccable's split between product screens and landing pages.
- **An early first-screen check.** The implementer was to post its first screen before the full
  revision, but Band posts a seat's replies only when its turn ends, so the early post arrived
  late. We removed the step.
- **A narrow mention rule.** Only the coordinator could mention seats, which woke seats with
  nothing to do. The rule is now: mention a seat when the message asks it to act now.
- **A sentence asking for a commit after every slice.** It changed nothing. Five commits still
  landed in the same second.

## Platform workarounds

These are workarounds for how Band and Claude Code behave today, not part of the design. They
can go when the platform changes.

- **A seat's replies are posted only when its turn ends with nothing still running.** A
  background subagent or command could leave a finished result unposted. The mandates say to
  run subagents in the foreground, and `guard-scope.py` enforces it.
- **The reply tool answers each incoming message once.** A seat that closed every part of a
  multi-part handoff before it finished had no message left to answer. The mandates now say to
  keep the part marked last open for the result.
- **Claude Code's auto-mode classifier blocked a seat's shell post to its own room.**
  `guard-scope.py` allows a seat to post to its room as itself, and nothing else.
- **The console's full-session download holds only the messages the console has loaded.** Our
  first download had the last 800 of 6,001 messages. Scroll the session to its first message,
  then download.

## Genericity

No mandate names a track, a product or a framework, and the official `harness check` passes the
mandates for toy, tablekeeper and pocketful. The version of the mandates used in development
run 3, with its later fixes, built tablekeeper stage 1 without edits in 1 h 40 min, with no
stall and no human message after the task, and the stage passed the shipped checks. An earlier
version of the design step ran in Band on tablekeeper's stage 2 screen requirements and
committed a direction in 10 min 44 s.
