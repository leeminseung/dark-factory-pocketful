#!/usr/bin/env python3
"""PreToolUse hook for the band's seats.

1. A dark-factory run takes no human input: block every tool that asks the human a
   question (Claude Code's AskUserQuestion, Jam's copy of it, and `band ask` / `jam ask`).
2. Keep the seats out of the operator's private folders on this machine, listed in
   private-paths.txt beside this file, which are not part of the factory.
3. Keep the seats' runtime settings and these hooks exactly as the operator set them.
4. Keep each turn free of work that outlives it. Band posts a seat's replies only when its
   turn ends with nothing left running, so subagents are switched to the foreground and
   background shell commands and monitors are refused.
5. Let a seat post to the room as itself from the shell (`jam ... --session <its own session>
   send ...`), and refuse a post as the human or as another seat. A post the seat composes from
   plain helpers (a here-document into /tmp, `cat`, a loop over parts) is approved here, so the
   runtime's automatic permission check cannot strand a finished result.

Exit 2 blocks the call and shows stderr to the model; exit 0 lets it run.
"""
import json
import os
import re
import shlex
import sys

HOME = os.path.expanduser("~")
# The folder that holds the result repositories, the challenge package and seat-config.
WORKSPACE = os.path.expanduser(os.environ.get("FACTORY_WORKSPACE", "~/dark-factory"))


def private_folders():
    """The operator's private folders on this machine: one path per line in private-paths.txt
    beside this file. Absolute, ~/ and $HOME/ spellings are all matched. None when absent."""
    try:
        here = os.path.dirname(os.path.abspath(__file__))
        lines = open(os.path.join(here, "private-paths.txt")).read().splitlines()
    except OSError:
        return []
    found = []
    for line in lines:
        path = line.strip()
        if not path or path.startswith("#"):
            continue
        full = os.path.expanduser(path)
        found.append(full)
        if full.startswith(HOME + "/"):
            rel = full[len(HOME) + 1:]
            found += ["~/" + rel, "$HOME/" + rel, rel]
    return found


PRIVATE = private_folders()
PRIVATE_RE = [
    # The operator's own Claude Code folder and file. The seats run from ~/.claude-seat.
    re.compile("(" + re.escape(HOME) + r"|~|\$HOME|\$\{HOME\})/\.claude(?![\w-])"),
    # Claude Code keeps each session's temporary files under /private/tmp/claude-<uid>/<folder>.
    # A seat's own folder is named after its working directory under the workspace (its
    # background command output lives there); every other folder belongs to the operator.
    re.compile(r"(/private)?/tmp/claude-" + str(os.getuid()) + r"\b(?!/"
               + re.escape(WORKSPACE.replace("/", "-")) + "-)"),
]
SEAT_CONFIG = os.path.basename(WORKSPACE) + "/seat-config"
RUNTIME = [".claude-seat/settings", SEAT_CONFIG]
WRITE_TOOLS = {"Write", "Edit", "MultiEdit", "NotebookEdit"}

ASK = ("This is a dark-factory run: the human answers no questions until the stage is "
       "over. Decide from the requirements and the repository evidence, record the choice "
       "and its reason, and if another seat holds the answer, ask @coordinator in the room.")
SCOPE = ("That path is outside the band's workspace. Work in the result repository, the "
         "requirement files your handoff names and the supplied checks.")
BACKGROUND = ("Run this in the foreground. Band posts your replies only when your turn ends "
              "with nothing left running, so a background command or monitor makes them get "
              "lost. To serve something while you test, start it detached (for example "
              "`docker run -d`) and stop it before you end your turn.")
KEEP = ("That file configures the seats' runtime and guardrails, and it stays as the "
        "operator set it. Carry on with your task inside the result repository.")
POST_AS_SELF = ("Post to the room only as yourself: `jam --profile default --session <your own "
                "session> send <room> --body-file <file>`. A seat never posts as the human "
                "(`band room send`) or as another seat (`--as`, or another seat's session).")


BAND_WITH_ARG = {"--config-dir", "--profile", "--session", "--scope", "--as"}


def mentions_private(text):
    return any(p in text for p in PRIVATE) or any(r.search(text) for r in PRIVATE_RE)


def asks_human(command):
    """True when a shell segment runs `band ask` or `jam ask` (global options allowed)."""
    lexer = shlex.shlex(command.replace("\n", " ; "), posix=True, punctuation_chars=True)
    lexer.whitespace_split = True
    try:
        tokens = list(lexer)
    except ValueError:  # unbalanced quotes: fall back to a plain split
        tokens = command.split()
    segment = []
    for token in tokens + [";"]:
        if token and set(token) <= set("&|;()"):
            words = segment
            while words and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*=.*", words[0]):
                words = words[1:]
            if words and os.path.basename(words[0]) in ("band", "jam"):
                j = 1
                while j < len(words) and words[j].startswith("-"):
                    j += 1 if "=" in words[j] else (2 if words[j] in BAND_WITH_ARG else 1)
                if j < len(words) and words[j] == "ask":
                    return True
            segment = []
        else:
            segment.append(token)
    return False


SEND_HELPERS = {"cat", "echo", "printf", "cd", "grep", "tail", "head", "true", "wc"}
SAFE_TARGETS = ("/tmp/", "/private/tmp/", "/dev/null")
HEREDOC = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1")
SUBSTITUTION = re.compile(r"\$\(([^()]*)\)|`([^`]*)`")
FD_NUMBER = re.compile(r"(^|[\s;&|()])\d+(?=[<>])")


def strip_heredocs(command):
    lines, out, end = command.split("\n"), [], None
    for line in lines:
        if end is not None:
            if line.strip() == end:
                end = None
            continue
        out.append(line)
        found = HEREDOC.search(line)
        if found:
            end = found.group(2)
    return "\n".join(out)


def own_session(seat, session):
    return bool(seat) and session is not None and (session == seat or session.endswith("-" + seat))


def band_post(command, seat):
    """'block' for a post as the human or another seat, 'allow' for a post the seat composes
    from plain helpers as itself, None otherwise (the normal permission flow decides)."""
    if not seat:  # not a seat session
        return None
    text = strip_heredocs(command)
    safe = True
    for inner in SUBSTITUTION.findall(text):
        words = (inner[0] or inner[1]).split()
        if not words or words[0] not in ("cat", "printf", "echo"):
            safe = False
    text = SUBSTITUTION.sub(" SUBST ", text)
    lexer = shlex.shlex(FD_NUMBER.sub(r"\1", text).replace("\n", " ; "), posix=True,
                        punctuation_chars=True)
    lexer.whitespace_split = True
    try:
        tokens = list(lexer) + [";"]
    except ValueError:
        return None
    posts, impostor, segment = 0, False, []
    for token in tokens:
        if not (token and set(token) <= set("&|;()")):
            segment.append(token)
            continue
        words, i = segment, 0
        segment = []
        while words and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*=.*", words[0]):
            words = words[1:]
        while words and words[0] in ("do", "then", "else", "!", "{"):
            words = words[1:]
        if not words or words[0] in ("for", "done", "fi", "}"):
            continue
        rest = []
        while i < len(words):
            w = words[i]
            if w in (">", ">>", ">|", "&>", "&>>"):
                target = words[i + 1] if i + 1 < len(words) else ""
                if not (target.startswith(SAFE_TARGETS) or target.startswith("&")):
                    safe = False
                i += 2
                continue
            if w in ("<", "<<", "<<-", ">&", "<&"):
                i += 2
                continue
            rest.append(w)
            i += 1
        if not rest:
            continue
        cmd = os.path.basename(rest[0])
        if cmd in ("band", "jam"):
            j, session, alias = 1, None, False
            while j < len(rest) and rest[j].startswith("-"):
                opt = rest[j]
                name, _, inline = opt.partition("=")
                value = inline if inline else (rest[j + 1] if j + 1 < len(rest) else None)
                if name in ("--session", "--scope"):
                    session = value
                if name == "--as":
                    alias = True
                j += 1 if inline or name not in BAND_WITH_ARG else 2
            sub = rest[j:j + 2]
            for k in range(j + 1, len(rest)):  # options may also follow the subcommand
                name, _, inline = rest[k].partition("=")
                if name in ("--session", "--scope"):
                    session = inline or (rest[k + 1] if k + 1 < len(rest) else None)
            if sub[:1] == ["send"]:
                if alias or "--as" in rest or not own_session(seat, session):
                    impostor = True
                posts += 1
            elif sub == ["room", "send"]:
                impostor = True
            else:
                safe = False
        elif cmd not in SEND_HELPERS:
            safe = False
    if impostor:
        return "block"
    if posts and safe:
        return "allow"
    return None


def mentions_runtime(text):
    return any(p in text for p in RUNTIME)


def main():
    try:
        call = json.load(sys.stdin)
    except ValueError:
        return 0
    tool = call.get("tool_name") or ""
    args = call.get("tool_input") or {}
    if tool in ("Agent", "Task") and args.get("run_in_background") is not False:
        updated = dict(args)
        updated["run_in_background"] = False
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
                                                 "updatedInput": updated}}))
        return 0
    if tool == "Monitor" or (tool == "Bash" and args.get("run_in_background")):
        print(BACKGROUND, file=sys.stderr)
        return 2
    if tool == "AskUserQuestion" or tool.endswith("__AskUserQuestion"):
        print(ASK, file=sys.stderr)
        return 2
    if tool == "Bash":
        command = args.get("command") or ""
        if asks_human(command):
            print(ASK, file=sys.stderr)
            return 2
        if mentions_runtime(command):
            print(KEEP, file=sys.stderr)
            return 2
        if mentions_private(command):
            print(SCOPE, file=sys.stderr)
            return 2
        post = band_post(command, os.environ.get("GIT_AUTHOR_NAME"))
        if post == "block":
            print(POST_AS_SELF, file=sys.stderr)
            return 2
        if post == "allow":
            print(json.dumps({"hookSpecificOutput": {
                "hookEventName": "PreToolUse", "permissionDecision": "allow",
                "permissionDecisionReason": "The seat posts to its own room as itself."}}))
        return 0
    for key in ("file_path", "path", "notebook_path", "pattern"):
        value = args.get(key)
        if not isinstance(value, str):
            continue
        both = os.path.normpath(os.path.expanduser(value)) + " " + value
        if SEAT_CONFIG in both or (tool in WRITE_TOOLS and ".claude-seat/settings" in both):
            print(KEEP, file=sys.stderr)
            return 2
        if mentions_private(both):
            print(SCOPE, file=sys.stderr)
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
