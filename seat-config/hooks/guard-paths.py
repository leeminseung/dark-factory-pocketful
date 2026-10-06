#!/usr/bin/env python3
"""PreToolUse hook for the band's seats: in the shared result repository, each seat writes
and commits only the paths it owns.

The seat is named by GIT_AUTHOR_NAME, which each seat's launcher sets. Ownership comes from
ownership.json beside this file: seat name -> glob patterns relative to the repository root
("*" stays inside one folder, "**" crosses folders). The result repository is the git
repository whose root holds mandates/. Paths outside it, temporary worktrees included, are
left alone, except the read-only folders ownership.json lists.

File tools are checked exactly. Shell commands are checked for git add, commit, rm, mv and
worktree add, output redirections, tee, sed -i, cp, mv, rm, touch and unlink. A write
hidden inside a script is not seen here, but the wrong seat still cannot commit it.

Exit 2 blocks the call and shows stderr to the model; exit 0 lets it run.
"""
import json
import os
import re
import shlex
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
WRITE_TOOLS = {"Write", "Edit", "MultiEdit", "NotebookEdit"}
SEPARATORS = {"&&", "||", ";", "|", "|&", "&", "(", ")"}
GIT_GLOBAL_WITH_ARG = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"}
ADD_EVERYTHING = {".", "-A", "--all", "-u", "--update", ":/", "*", "--no-ignore-removal"}
NULL_TARGETS = {"-", "/dev/null", "/dev/stdout", "/dev/stderr", "/dev/tty"}
COMMIT_FORM = 'git add <your paths> && git commit -m "<message>" -- <your paths>'
HEREDOC = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1")


def glob_re(pattern):
    out, i = "", 0
    while i < len(pattern):
        if pattern.startswith("**", i):
            out, i = out + ".*", i + 2
        elif pattern[i] == "*":
            out, i = out + "[^/]*", i + 1
        else:
            out, i = out + re.escape(pattern[i]), i + 1
    return re.compile(out + r"\Z")


class Rules:
    def __init__(self, path):
        with open(path) as f:
            data = json.load(f)
        self.patterns = data["owners"]
        self.owners = {seat: [glob_re(p) for p in pats] for seat, pats in self.patterns.items()}
        self.read_only = [os.path.realpath(os.path.expanduser(p)) for p in data.get("read_only", [])]
        self.roots = {}

    def owner_of(self, rel):
        for seat, regexes in self.owners.items():
            if any(r.match(rel) or r.match(rel.rstrip("/") + "/") for r in regexes):
                return seat
        return None

    def band_root(self, path):
        folder = path
        while folder and not os.path.isdir(folder):
            folder = os.path.dirname(folder)
        if folder not in self.roots:
            root = None
            try:
                found = subprocess.run(
                    ["git", "-C", folder, "rev-parse", "--path-format=absolute", "--git-common-dir"],
                    capture_output=True, text=True, timeout=5)
                common = found.stdout.strip() if found.returncode == 0 else ""
                if os.path.basename(common) == ".git" and os.path.isdir(
                        os.path.join(os.path.dirname(common), "mandates")):
                    root = os.path.realpath(os.path.dirname(common))
            except (OSError, subprocess.SubprocessError):
                pass
            self.roots[folder] = root
        return self.roots[folder]

    def inside(self, path):
        """Return (root, path relative to it) when path lies in the result repository."""
        real = os.path.realpath(path)
        root = self.band_root(real)
        if not root:
            return None, None
        rel = os.path.relpath(real, root)
        if rel.startswith(".."):
            return None, None
        return root, ("" if rel == "." else rel)

    def problem(self, seat, path):
        real = os.path.realpath(path)
        for folder in self.read_only:
            if real == folder or real.startswith(folder + os.sep):
                return f"{path}: this folder is read-only for the band (the challenge package and the shared skills are never changed)."
        root, rel = self.inside(path)
        if root is None:
            return None
        owner = self.owner_of(rel) if rel else None
        if owner == seat:
            return None
        whose = f"it belongs to {owner}" if owner else "no seat owns it"
        return f"{rel or 'the repository root'}: {whose}."


def strip_heredocs(command):
    """Drop here-document bodies so their lines are not read as commands."""
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


# A file-descriptor number written against its redirection (`2>/dev/null`, `2>&1`) belongs to
# the redirection, not to the command's arguments. The tokenizer would split it off as a word,
# so drop it first; `2 > file`, with a space, stays an argument.
FD_NUMBER = re.compile(r"(^|[\s;&|()])\d+(?=[<>])")


def tokens_of(command):
    text = FD_NUMBER.sub(r"\1", strip_heredocs(command))
    lexer = shlex.shlex(text.replace("\n", " ; "), posix=True,
                        punctuation_chars=True)
    lexer.whitespace_split = True
    try:
        return list(lexer)
    except ValueError:  # unbalanced quotes: fall back to a plain split
        return command.split()


def segments(tokens):
    current = []
    for token in tokens:
        if token in SEPARATORS or (token and set(token) <= set("&|;()")):
            if current:
                yield current
            current = []
        else:
            current.append(token)
    if current:
        yield current


def split_redirects(segment):
    """Return (output redirection targets, the remaining words)."""
    targets, words, skip = [], [], False
    for i, token in enumerate(segment):
        if skip:
            skip = False
            continue
        following = segment[i + 1] if i + 1 < len(segment) else ""
        if token and set(token) <= set("<>&|0123456789") and ">" in token:
            skip = True
            if not (token.endswith("&") or following.startswith("&") or following.isdigit()
                    or following in NULL_TARGETS):
                targets.append(following)
        elif token and set(token) <= set("<&") and "<" in token:
            skip = True
        else:
            words.append(token)
    while words and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*=.*", words[0]):
        words = words[1:]
    return targets, words


VARIABLE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)")
ASSIGNMENT = re.compile(r"([A-Za-z_][A-Za-z0-9_]*)=(.*)")


def expand(token, env):
    """Expand $NAME and ${NAME} from assignments earlier in the command, then the environment."""
    def value(match):
        name = match.group(1) or match.group(2)
        if name in env:
            return env[name]
        return os.environ.get(name, match.group(0))
    return VARIABLE.sub(value, token)


def unreadable(token):
    """A path the guard cannot know before the shell runs: an unknown variable or command output."""
    return "$" in token or "`" in token


def resolve(cwd, path):
    if cwd is None or unreadable(path):
        return None
    return os.path.normpath(os.path.join(cwd, os.path.expanduser(path)))


def plain_args(args):
    if "--" in args:
        k = args.index("--")
        return [a for a in args[:k] if not a.startswith("-")] + args[k + 1:]
    return [a for a in args if not a.startswith("-")]


def shell_findings(rules, seat, command, cwd):
    paths, git_paths, notes, env = [], [], [], {}
    for segment in segments(tokens_of(command)):
        lead = segment[1:] if segment and segment[0] in ("export", "local", "declare", "readonly") else segment
        for token in lead:
            assigned = ASSIGNMENT.fullmatch(token)
            if not assigned:
                break
            env[assigned.group(1)] = expand(assigned.group(2), env)
        words_out = []
        for token in segment:
            expanded = expand(token, env)
            # An unquoted $LIST splits into words in the shell; do the same for a bare reference.
            if VARIABLE.fullmatch(token) and expanded != token:
                words_out += expanded.split()
            else:
                words_out.append(expanded)
        segment = words_out
        targets, words = split_redirects(segment)
        paths += [resolve(cwd, t) for t in targets if t]
        if not words:
            continue
        cmd, args = os.path.basename(words[0]), words[1:]
        if cmd in ("cd", "pushd"):
            if args and args[0] != "-":
                cwd = resolve(cwd, args[0])
            elif not args:
                cwd = os.path.expanduser("~")
            continue
        if cmd == "git":
            j, git_cwd = 0, cwd
            while j < len(args) and args[j].startswith("-"):
                if args[j] == "-C" and j + 1 < len(args):
                    git_cwd = resolve(git_cwd, args[j + 1])
                j += 2 if args[j] in GIT_GLOBAL_WITH_ARG else 1
            if j >= len(args):
                continue
            sub, rest = args[j], args[j + 1:]
            if sub == "add":
                if any(a in ADD_EVERYTHING or a.startswith("--all") for a in rest):
                    notes.append("Name your own paths instead of adding everything.")
                git_paths += [(a, resolve(git_cwd, a)) for a in plain_args(rest)]
            elif sub == "commit":
                if "--" not in rest:
                    notes.append(f"Commit only your own paths, named after `--`: `{COMMIT_FORM}`.")
                    continue
                options = rest[:rest.index("--")]
                if any(o in ("-a", "--all") or re.fullmatch(r"-[A-Za-z]*a[A-Za-z]*", o) for o in options):
                    notes.append(f"Commit without `-a`: `{COMMIT_FORM}`.")
                git_paths += [(a, resolve(git_cwd, a)) for a in rest[rest.index("--") + 1:]]
            elif sub in ("rm", "mv"):
                git_paths += [(a, resolve(git_cwd, a)) for a in plain_args(rest)]
            elif sub == "checkout" and "--" in rest:
                git_paths += [(a, resolve(git_cwd, a)) for a in rest[rest.index("--") + 1:]]
            elif sub == "restore":
                skip, named = False, []
                for a in rest:
                    if skip:
                        skip = False
                    elif a in ("-s", "--source"):
                        skip = True
                    elif a == "--" or a.startswith("-"):
                        continue
                    else:
                        named.append(a)
                git_paths += [(a, resolve(git_cwd, a)) for a in named]
            elif sub == "worktree" and rest[:1] == ["add"]:
                places = plain_args(rest[1:])
                place = resolve(git_cwd, places[0]) if places else None
                if place and rules.inside(place)[0]:
                    notes.append("Make temporary worktrees outside the repository, in the "
                                 "folder your stage task names.")
        elif cmd == "tee":
            paths += [resolve(cwd, a) for a in args if not a.startswith("-")]
        elif cmd == "sed":
            if any(a.startswith("-i") or a.startswith("--in-place") for a in args):
                paths += [resolve(cwd, a) for a in args if a and not a.startswith("-")
                          and resolve(cwd, a) and os.path.isfile(resolve(cwd, a))]
        elif cmd in ("cp", "install"):
            plain = [a for a in args if not a.startswith("-")]
            if len(plain) >= 2:
                paths.append(resolve(cwd, plain[-1]))
        elif cmd in ("mv", "rm", "rmdir", "unlink", "touch"):
            paths += [resolve(cwd, a) for a in args if a and not a.startswith("-")]
    for raw, path in git_paths:
        if path is None:
            notes.append(f"Write the paths of git add, commit, rm and mv literally; the guard "
                         f"cannot read `{raw}` before the shell runs.")
        else:
            paths.append(path)
    # Other writes whose target the guard cannot read are let through: the commit is the gate.
    problems = [p for p in (rules.problem(seat, path) for path in paths if path) if p]
    return problems, notes


def main():
    seat = os.environ.get("GIT_AUTHOR_NAME")
    if not seat:  # not a seat session
        return 0
    try:
        call = json.load(sys.stdin)
    except ValueError:
        return 0
    tool = call.get("tool_name") or ""
    args = call.get("tool_input") or {}
    cwd = call.get("cwd") or os.getcwd()
    rules = Rules(os.environ.get("BAND_OWNERSHIP") or os.path.join(HERE, "ownership.json"))
    problems, notes = [], []
    if tool in WRITE_TOOLS:
        path = args.get("file_path") or args.get("notebook_path")
        if isinstance(path, str) and path:
            found = rules.problem(seat, resolve(cwd, path))
            problems += [found] if found else []
    elif tool == "Bash":
        problems, notes = shell_findings(rules, seat, args.get("command") or "", cwd)
    if not problems and not notes:
        return 0
    mine = ", ".join(rules.patterns.get(seat, [])) or "nothing (this seat has no entry)"
    lines = ["Blocked by the band's path rule: each seat writes and commits only its own paths "
             f"in the shared repository. {seat} owns {mine}."]
    lines += [f"- {p}" for p in dict.fromkeys(problems)] + [f"- {n}" for n in dict.fromkeys(notes)]
    if problems:
        lines.append("If one of those files needs a change, hand the change to the seat that owns it."
                     if seat == "coordinator" else
                     "If one of those files needs a change, tell @coordinator what should change and why.")
    print("\n".join(lines), file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
