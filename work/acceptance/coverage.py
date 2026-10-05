"""Fill the Tests column of work/stage-N/requirements.md from the @pytest.mark.req markers.

    python work/acceptance/coverage.py <N>

Rows that already say "not testable" are left alone; rows with tests get status "tested" unless
they already carry a later status (passing, failing, disputed). Prints rows covered / total.
"""
import ast
import pathlib
import re
import sys
from collections import defaultdict

HERE = pathlib.Path(__file__).resolve().parent
stage = sys.argv[1]
req_file = HERE.parent / f"stage-{stage}" / "requirements.md"

covers = defaultdict(list)
for n in range(1, int(stage) + 1):
    for path in sorted((HERE / "tests" / f"stage_{n}").glob("test_*.py")):
        tree = ast.parse(path.read_text())
        for node in tree.body:
            if not isinstance(node, ast.FunctionDef):
                continue
            for dec in node.decorator_list:
                if (isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute)
                        and dec.func.attr == "req"):
                    for arg in dec.args:
                        covers[arg.value].append(f"{path.name}::{node.name}")

SPLIT = re.compile(r"(?<!\\)\|")   # cell separators: pipes not escaped as \|

lines = req_file.read_text().splitlines()
total = covered = 0
missing = []
out = []
for line in lines:
    m = re.match(r"^\| (S\d+-\d+) \|", line)
    if m:
        cells = [c.strip() for c in SPLIT.split(line)[1:-1]]
        rid = m.group(1)
        total += 1
        status = cells[-1]
        if status.startswith("not testable"):
            covered += 1
        elif covers.get(rid):
            covered += 1
            cells[-2] = "<br>".join(sorted(set(covers[rid])))
            if status in ("open", "tested", ""):
                cells[-1] = "tested"
        else:
            missing.append(rid)
        line = "| " + " | ".join(cells) + " |"
    out.append(line)
req_file.write_text("\n".join(out) + "\n")
print(f"rows covered {covered}/{total}; without a test: {missing}")
