# Code smells

The names follow Martin Fowler's *Refactoring* (second edition). Each is a judgement call:
report it when it makes a rule the change touches harder to find or to change, and say which
rule.

| Smell | What it looks like |
|---|---|
| Mysterious name | A name that does not say what the thing does or holds, so a reader has to open it to find out. |
| Duplicated code | The same logic, or the same rule, written in more than one place. |
| Feature envy | A function that works mostly with another module's data and little with its own. |
| Data clumps | The same few values passed around together everywhere; they want to be one type. |
| Primitive obsession | Plain strings and numbers standing for values that have rules, such as amounts of money, identifiers or instants. |
| Repeated switches | The same switch or if-chain on a kind of thing, written in several places. |
| Shotgun surgery | One change to a rule needs small edits in many modules. |
| Divergent change | One module changes for several unrelated reasons. |
| Speculative generality | Parameters, hooks or layers for needs nobody has stated. |
| Message chains | A caller reaches data through a long chain of calls on other objects. |
| Middle man | A module that only passes calls on to another. |
| Refused bequest | A subtype that ignores or overrides most of what it inherits. |
