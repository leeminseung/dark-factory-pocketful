// A small DOM builder: h('div', { class: 'row', testid: 'x' }, child, ...).
// `testid` becomes data-testid, `on*` attaches listeners, `data` sets data-* attributes,
// `html` inserts trusted markup (only our own inline SVG icons), false/null children are skipped.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'testid') el.dataset.testid = value;
    else if (key === 'class') el.className = value;
    else if (key === 'data') Object.entries(value).forEach(([k, v]) => { el.dataset[k] = v; });
    else if (key === 'html') el.innerHTML = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Replaces the children of `el`. */
export function fill(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

let ids = 0;
/** A fresh element id, for label/input pairs. */
export const uid = (prefix = 'f') => `${prefix}-${(ids += 1)}`;
