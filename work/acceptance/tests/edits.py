"""Helpers for edited-export tests: find values the test created inside an opaque state."""


def paths_of(obj, pred, path=()):
    """Every path in a JSON value whose leaf satisfies pred."""
    out = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            out += paths_of(v, pred, path + (k,))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            out += paths_of(v, pred, path + (i,))
    elif pred(obj):
        out.append(path)
    return out


def get_at(obj, path):
    for p in path:
        obj = obj[p]
    return obj


def set_at(obj, path, value):
    get_at(obj, path[:-1])[path[-1]] = value


def record_holding(state, value):
    """Every dict in the state that directly holds `value` as one of its fields."""
    paths = paths_of(state, lambda v: v == value and not isinstance(v, bool))
    return [get_at(state, p[:-1]) for p in paths if isinstance(get_at(state, p[:-1]), dict)]
