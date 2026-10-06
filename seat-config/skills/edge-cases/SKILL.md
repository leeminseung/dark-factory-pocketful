---
name: edge-cases
description: Use when writing acceptance tests from requirements, or when probing a running service for defects - the kinds of case to try for every requirement, and a memory of defects that earlier runs let through their acceptance tests.
---

# Edge cases

For every requirement, try each kind of case below that applies, through the product's
public interfaces only. Take the expected result from the requirement text (its examples and
stated rules), never from what the product does.

## Kinds of case

- **Boundaries:** the smallest and largest valid values, and one past each limit.
- **Errors:** every listed error case, and the stated precedence when several apply at once.
- **Input forms:** wrong types, missing or empty fields, and numbers written in other forms.
- **Text:** rules that count, replace or truncate text, applied per character to multibyte,
  combining and emoji text.
- **Repetition:** operations sent again, at the same time as others, and after a failure.
- **Parties:** every party that is allowed and every party that is refused.
- **Order:** ordering, paging and the marker for more items.
- **Time:** time, expiry and timestamp formats.
- **Limits:** stated limits on time, size and resources, under worst-case inputs.
- **Survival:** state that must survive an export, an import or an upgrade from the previous
  stage.

## Case memory

`references/case-memory.md` lists defects that passed an acceptance suite in earlier runs and
were caught later by a review, each written as a case to try. Read it before you write tests
or plan a probe, and try every case in it that applies to the requirements at hand.
