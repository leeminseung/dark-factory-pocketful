# Pocketful, built by a five-agent factory

Team Leeward (one person). Track: pocketful, a wallet with payments, requests, splits, holds,
corrections and refunds. A band of five Claude Code seats in Band Desktop built this service
one stage at a time. For each stage the human sent one task message, and the seats did the
rest: they split the work, tested and reviewed each other, and decided when the stage was done.

## Results

- **Stages:** all four. On a clean clone, the supplied checks in isolated mode credit every
  `stage-N/` folder with stage N.
- **Human input:** the four stage tasks and nothing else. No recovery message, no stall.
- **Time:** 9 h 59 min from the first stage task to the final report (stages 1 h 52 min,
  3 h 14 min, 2 h 21 min, 2 h 30 min).
- **Checking:** the final review sent every stage back (9, 7, 7 and 1 blocking findings), and
  the round-1 code reviews raised 7 more. All 31 were fixed before acceptance.
- **Model spend:** $207 at Opus 5.5 API prices, computed from the seats' session logs (the seats
  ran on a subscription).

`FACTORY.md` has the details, the baseline we compared against and what we tried that failed.

## What is here

| Path | What it holds |
|---|---|
| `stage-1/` to `stage-4/` | The service at each stage. Each folder builds and runs by its own `RUN.md` and still passes every earlier stage. |
| `mandates/` | One mandate per seat: coordinator, implementer, test-designer, reviewer, product-designer. |
| `FACTORY.md` | How the factory works and why, how to stand it up, what it cost, how it catches bad work, and what we tried that failed. |
| `room.json` | The Band room of this run, downloaded from the Band console ("Download full session") and left unedited. |
| `work/` | The band's own records: requirement lists, glossary, acceptance tests, design direction, reviews, decisions and the case memory. |
| `seat-config/` | Seat launchers, hooks, skills, the scripts that create the seats and start a run, and the stage task template. |

## How to read it

1. Start with `FACTORY.md`.
2. For any stage, `work/stage-N/decisions.md` holds the plan, one line per checking round,
   every ruling with its quote, the acceptance and the retro.
3. `work/reviews/` holds every acceptance, design and code review report. Reviews made in a
   fresh context keep the exact brief the subagent got and its unedited answer beside the
   report. `work/reviews/screens/` holds the screenshots of each accepted revision.
4. `room.json` is the whole conversation, 6,001 messages. Commits name the requirement and
   finding ids that the room messages discuss, so each change can be followed from the room to
   the code.

## Running a stage

Each `stage-N/RUN.md` gives the exact commands. The service runs from a clean container with
no network access.
