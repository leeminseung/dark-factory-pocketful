#!/usr/bin/env python3
"""PreToolUse hook for the band's seats: block git commands that rewrite history or
throw away other seats' work in the shared working tree.

Claude Code passes the tool call as JSON on stdin. Exit 2 blocks the call and shows
stderr to the model; exit 0 lets it run.
"""
import json
import os
import shlex
import sys

OPERATORS = {"&&", "||", ";", "|", "&", "\n", "(", ")"}
GLOBAL_WITH_ARG = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"}
ALWAYS_BLOCKED = {"push", "pull", "reset", "rebase", "merge", "cherry-pick", "revert", "am",
                  "stash", "clean", "switch", "filter-branch", "filter-repo", "update-ref",
                  "replace"}

MESSAGE = (
    "Blocked by the band's git guardrail: every seat shares one working tree and the "
    "history stays exactly as it happened. Commit only your own paths with "
    "`git add <paths> && git commit -m \"<message>\" -- <paths>`. To look at another "
    "revision, use `git worktree add --detach <dir> <revision>`. To undo a change of "
    "your own, edit the file and commit again."
)


def segments(command):
    lexer = shlex.shlex(command, posix=True, punctuation_chars=True)
    lexer.whitespace_split = True
    current = []
    try:
        for token in lexer:
            if token in OPERATORS or set(token) <= set("&|;()"):
                if current:
                    yield current
                current = []
            else:
                current.append(token)
    except ValueError:  # unbalanced quotes: fall back to a plain split
        current = command.split()
    if current:
        yield current


def blocked(tokens):
    for i, token in enumerate(tokens):
        if os.path.basename(token) != "git":
            continue
        j = i + 1
        while j < len(tokens) and tokens[j].startswith("-"):
            opt = tokens[j]
            j += 2 if opt in GLOBAL_WITH_ARG else 1
        if j >= len(tokens):
            return None
        sub, args = tokens[j], tokens[j + 1:]
        if sub == "stash" and args[:1] in (["list"], ["show"]):
            return None  # read-only
        if sub in ALWAYS_BLOCKED:
            return f"git {sub}"
        # Restoring named paths is allowed here; guard-paths checks that they are the seat's own.
        if sub == "checkout" and "--" not in args:
            return "git checkout"
        if sub == "commit" and "--amend" in args:
            return "git commit --amend"
        if sub == "branch" and any(a in ("-D", "-d", "--delete", "-M", "-m", "--move", "-f", "--force") for a in args):
            return "git branch " + " ".join(a for a in args if a.startswith("-"))
        if sub == "reflog" and args and args[0] in ("expire", "delete"):
            return f"git reflog {args[0]}"
        if sub == "tag" and any(a in ("-d", "--delete", "-f", "--force") for a in args):
            return "git tag " + " ".join(a for a in args if a.startswith("-"))
        if sub == "worktree" and args and args[0] in ("move",):
            return "git worktree move"
        return None
    return None


def main():
    try:
        call = json.load(sys.stdin)
    except ValueError:
        return 0
    if call.get("tool_name") != "Bash":
        return 0
    command = (call.get("tool_input") or {}).get("command") or ""
    for tokens in segments(command):
        hit = blocked(tokens)
        if hit:
            print(f"{MESSAGE} (matched: {hit})", file=sys.stderr)
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
