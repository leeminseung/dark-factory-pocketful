---
name: engineering-principles
description: Use when building a service's code or reviewing it - the design principles a builder applies and a reviewer checks, the code smells to look for, and how to fix a defect so that it stays fixed.
---

# Engineering principles

The builder applies these principles and the reviewer checks the code against them. Each
principle ends with what a reviewer reports as a finding.

## Principles

1. **One gate per invariant.** List the conditions the requirements say must always hold.
   Every operation that changes the state they protect goes through one place that checks
   them and applies the whole change or none of it. A second path to that state, or one that
   skips the check, is a finding.
2. **One place per decision.** Each format, rule, limit and storage choice lives in one
   module behind a small interface, so that changing the rule changes one place. Before you
   build, sketch two structures and keep the simpler one. A rule spread over several places,
   or written twice, is a finding.
3. **Failure and repetition are normal.** For every operation that changes state, decide and
   test what happens when it is sent again, when it runs at the same time as another, and
   when it stops halfway. An operation without defined, tested behaviour in these cases is a
   finding.
4. **Pin behaviour before changing it.** Before you change code that earlier work relies on,
   run its tests; if that code is not covered, first add a test of what it does now. Commit
   the restructuring on its own with the tests still passing, then commit the new behaviour:
   make the change easy, then make the easy change. Earlier tests that no longer run or pass,
   and a commit labelled as restructuring that changes behaviour, are findings.
5. **Vertical slices in small commits.** Build one narrow path through every layer at a
   time, each working before the next begins, and commit each slice on its own as soon as it
   works. A commit has one purpose, and its message names what it serves and what it fixes. A
   commit with several purposes, or one that names nothing, is a finding.
6. **Readability.** Another developer can find and change any one rule quickly, and each name
   says what the thing is for.

## Code smells

A smell is a judgement call, not a rule: report one when it makes a rule the change touches
harder to find or to change. The list, after Fowler's *Refactoring*, with what each smell
looks like, is in `references/code-smells.md`.

## Fixing a defect

1. First make a command that fails because of the defect: a test at the level where the
   defect lives.
2. Fix the code until the command passes, and keep it as a regression test.
3. Put the cause in the commit message, not only the symptom.
