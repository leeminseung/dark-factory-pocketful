"""Screen checks: layout and behaviour rules the Node tests cannot see (needs a browser).

Run from stage-2/:  python3 test/screen_checks.py
Needs Python with Playwright and Chromium (pip install playwright && playwright install chromium).
It starts the service on a free port, seeds it, and checks at 375 px and 1280 px. Exit 0 = all pass.
"""
import datetime, json, os, socket, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright

def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


PORT = free_port()
B = f'http://127.0.0.1:{PORT}'
HERE = os.path.dirname(os.path.abspath(__file__))
server = subprocess.Popen(['node', os.path.join(HERE, '..', 'src', 'main.js')], env={**os.environ, 'PORT': str(PORT)},
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try:
        urllib.request.urlopen(B + '/health'); break
    except Exception:
        time.sleep(0.05)
S = lambda t: f"[data-testid='{t}']"
results = {}


def call(m, path, body=None, token=None, key=None):
    h = {'content-type': 'application/json'}
    if token: h['authorization'] = 'Bearer ' + token
    if key: h['idempotency-key'] = key
    r = urllib.request.urlopen(urllib.request.Request(B + path, data=None if body is None else json.dumps(body).encode(), headers=h, method=m))
    t = r.read()
    return json.loads(t) if t else None


def user(i, handle, name, balance):
    return {"id": f"u_{i}", "email": f"{handle}@example.com", "password": "correct horse", "display_name": name, "handle": handle, "balance": balance}


def seed():
    soon = (datetime.datetime.now(datetime.UTC) + datetime.timedelta(hours=1, minutes=5)).strftime('%Y-%m-%dT%H:%M:%S+00:00')
    call('POST', '/_test/reset', {"currency": "EUR", "minor_units": 2, "users": [
        user('g', 'grace_okafor_lindqvi', 'Maximiliane Okafor-Lindqvist', 99999999),
        user('l', 'l1_0o', 'Lin', 5000), user('z', 'zed', 'Zed', 0)],
        "authorizations": [{"id": "a_soon", "from_user_id": "u_g", "to_user_id": "u_l", "amount": 4000, "note": "",
                            "visibility": "public", "status": "open", "expires_at": soon}]})
    g = call('POST', '/auth/login', {"email": "grace_okafor_lindqvi@example.com", "password": "correct horse"})['token']
    l = call('POST', '/auth/login', {"email": "l1_0o@example.com", "password": "correct horse"})['token']
    call('POST', '/payments', {"to_handle": "l1_0o", "amount": 100}, g, 'p1')
    call('POST', '/requests', {"payer_handle": "grace_okafor_lindqvi", "amount": 100, "note": ""}, l, 'r1')
    call('POST', '/requests', {"payer_handle": "l1_0o", "amount": 100, "note": ""}, g, 'r2')
    v = call('POST', '/authorizations', {"to_handle": "l1_0o", "amount": 50}, g, 'a2')
    call('POST', f"/authorizations/{v['authorization_id']}/void", None, g)
    return g


def login(pg, handle):
    pg.goto(B + '/login')
    pg.fill(S('login-email'), f'{handle}@example.com')
    pg.fill(S('login-password'), 'correct horse')
    pg.click(S('login-submit'))
    pg.wait_for_selector(S('current-user'))


def check(name, ok, detail):
    results[name] = (ok, detail)


try:
  seed()
  with sync_playwright() as p:
      b = p.chromium.launch()
      pg = b.new_page(viewport={'width': 375, 'height': 800})
      login(pg, 'grace_okafor_lindqvi')
      pg.wait_for_selector(S('wallet-balance'))
      hh = pg.evaluate("document.querySelector('.site-header .header-row').getBoundingClientRect().height")
      lines = pg.evaluate("[...document.querySelectorAll('.who-name, [data-testid=logout-button]')].map(e => Math.round(e.getBoundingClientRect().height))")
      check('D1 header one line at 375', hh <= 72 and lines[0] <= 26 and lines[1] <= 48, f'header {hh}px, name/logout heights {lines}')
      broken = pg.evaluate("""[...document.querySelectorAll('.row-title .handle, .share-handle-text')].filter(e => e.getClientRects().length > 1).map(e => e.textContent)""")
      titles = pg.evaluate("""[...document.querySelectorAll('[data-testid^=activity-parties-]')].map(e => { const r = document.createRange(); r.selectNodeContents(e); return r.getClientRects().length; })""")
      handle_spans = pg.evaluate("document.querySelectorAll('.row-title .handle').length")
      check('D2 handles never break (feed)', handle_spans > 0 and not broken, f'handle spans {handle_spans}, broken {broken}, title rects {titles}')
      links = pg.evaluate("""[...document.querySelectorAll('.held-link, .wordmark')].map(e => [e.className, Math.round(e.getBoundingClientRect().height)])""")
      check('D6 action links >=44px (wallet)', all(h >= 44 for _, h in links), str(links))
      seg = pg.evaluate("document.querySelector('.bar-held').getBoundingClientRect().width")
      check('D4 tiny held gets >=16px hatch', seg >= 16, f'held segment {seg}px')
      sw = pg.evaluate("document.querySelector('.hatch-swatch svg') ? document.querySelectorAll('.hatch-swatch svg path, .hatch-swatch svg line').length : 0")
      check('D7 swatch is drawn hatch (svg lines)', sw >= 1, f'svg paths {sw}')
      # D12: wallet-held sits level with its label
      centers = pg.evaluate("""(() => { const c = (e) => { const g = document.createRange(); g.selectNodeContents(e); const r = [...g.getClientRects()].pop(); return r.bottom; };
          return [c(document.querySelector('.held-line dt')), c(document.querySelector('[data-testid=wallet-held]'))]; })()""")
      check('D12 wallet-held level with its label', abs(centers[0] - centers[1]) <= 3, f'label/amount text bottoms {centers}')
      # D8: one icon while refreshing: put the button in its busy state and count what shows
      icons = pg.evaluate("""(() => { const b = document.querySelector('[data-testid=wallet-refresh]'); b.classList.add('is-busy');
          const n = [...b.querySelectorAll('.icon')].filter(e => getComputedStyle(e).display !== 'none').length; b.classList.remove('is-busy'); return n; })()""")
      check('D8 one icon while refreshing', icons == 1, f'visible icons {icons}')
      # D11: success line cleared by next action
      pg.fill(S('pay-handle'), 'l1_0o'); pg.fill(S('pay-amount'), '0.01'); pg.click(S('pay-submit'))
      pg.wait_for_selector('.form-pay .feedback.success')
      pg.fill(S('authorize-handle'), 'l1_0o'); pg.fill(S('authorize-amount'), '0.01'); pg.click(S('authorize-submit'))
      pg.wait_for_selector('.form-authorize .feedback.success')
      stale = pg.query_selector('.form-pay .feedback.success') is not None
      check('D11 stale success line removed', not stale, f'pay success still shown: {stale}')
      # D9: strip while loading
      pg.route('**/requests?*', lambda route: (time.sleep(0.8), route.continue_()))
      pg.goto(B + '/requests')
      pg.wait_for_timeout(250)
      strip = pg.evaluate("document.querySelector('.plum-strip').textContent")
      pg.wait_for_timeout(1200)
      pg.unroute('**/requests?*')
      check('D9 strip says Loading while loading', 'Loading' in strip, repr(strip))
      pg.wait_for_selector(S('incoming-list'), state='attached')
      # D10: wording
      pg.goto(B + '/authorizations'); pg.wait_for_selector(S('authorization-list'))
      text = pg.inner_text(S('authorization-list'))
      check('D10 "today" and "back to you"', 'Collect by today' in text and 'went back to you' in text, text.replace('\n', ' | ')[:300])
      # D6 on front door
      pg2 = b.new_page(viewport={'width': 375, 'height': 800})
      pg2.goto(B + '/login')
      fl = pg2.evaluate("[...document.querySelectorAll('.door-other a')].map(e => Math.round(e.getBoundingClientRect().height))")
      check('D6 front-door switch link >=44px', all(h >= 44 for h in fl), str(fl))
      # D3 and D5 at desktop
      pg3 = b.new_page(viewport={'width': 1280, 'height': 900})
      login(pg3, 'grace_okafor_lindqvi')
      for route, anchor in (('/requests', 'incoming-list'), ('/authorizations', 'authorization-list')):
          pg3.goto(B + route); pg3.wait_for_selector(S(anchor), state='attached'); pg3.wait_for_timeout(200)
          w = pg3.evaluate(f"Math.round(document.querySelector('[data-testid={anchor}] > li').getBoundingClientRect().width)")
          check(f'D3 rows <=760 on {route}', w <= 760, f'{w}px')
      pg3.goto(B + '/requests'); pg3.wait_for_selector(S('outgoing-list'), state='attached'); pg3.wait_for_timeout(200)
      gaps = pg3.evaluate("""(() => { const hs = [...document.querySelectorAll('.list-section h2')];
          return hs.map(h => { const prev = h.parentElement.previousElementSibling; return prev ? Math.round(h.getBoundingClientRect().top - prev.getBoundingClientRect().bottom) : null; }); })()""")
      check('D5 section gap 48 before "You asked"', gaps and gaps[-1] is not None and 44 <= gaps[-1] <= 56, str(gaps))
      pg4 = b.new_page(viewport={'width': 375, 'height': 800})
      login(pg4, 'zed'); pg4.wait_for_selector(S('wallet-balance'))
      empty = pg4.evaluate("document.querySelector('.bar').classList.contains('bar-empty')")
      check('D4 empty track at total 0', empty, f'bar-empty {empty}')
      # R15: every legal balance fits at 375 px with no horizontal scroll, and stays the headline
      for currency, units in (('EUR', 2), ('JPY', 0), ('BHD', 3)):
          for balance in (1_000_000_000, 2 ** 53 - 1):
              call('POST', '/_test/reset', {"currency": currency, "minor_units": units, "users": [
                  user('r', 'rich_and_long_handle', 'Maximiliane Okafor-Lindqvist', balance), user('p', 'l1_0o', 'Lin', 0)]})
              rich = call('POST', '/auth/login', {"email": "rich_and_long_handle@example.com", "password": "correct horse"})['token']
              poor = call('POST', '/auth/login', {"email": "l1_0o@example.com", "password": "correct horse"})['token']
              part = min(1_000_000_000, balance // 4)
              call('POST', '/authorizations', {"to_handle": "l1_0o", "amount": part}, rich, 'h1')
              call('POST', '/requests', {"payer_handle": "rich_and_long_handle", "amount": 1_000_000_000}, poor, 'q1')
              call('POST', '/payments', {"to_handle": "l1_0o", "amount": part}, rich, 'y1')
              ph = b.new_page(viewport={'width': 375, 'height': 800})
              login(ph, 'rich_and_long_handle')
              widths = {}
              for route, anchor in (('/', 'wallet-available'), ('/requests', 'incoming-list'), ('/authorizations', 'authorization-list')):
                  ph.goto(B + route); ph.wait_for_selector(S(anchor), state='attached'); ph.wait_for_timeout(150)
                  widths[route] = ph.evaluate('document.documentElement.scrollWidth')
              ph.goto(B + '/split'); ph.wait_for_selector(S('split-amount'))
              ph.fill(S('split-amount'), '9' * 10 + ('.' + '9' * units if units else '')); ph.fill(S('split-handles'), 'rich_and_long_handle,l1_0o')
              ph.wait_for_timeout(100)
              widths['/split'] = ph.evaluate('document.documentElement.scrollWidth')
              ph.goto(B + '/'); ph.wait_for_selector(S('wallet-available'))
              sizes = ph.evaluate("""['wallet-available', 'wallet-balance', 'wallet-held'].map(t => parseFloat(getComputedStyle(document.querySelector(`[data-testid=${t}]`)).fontSize))""")
              check(f'R15 {currency} {balance}: no horizontal scroll at 375 px', all(w <= 375 for w in widths.values()), str(widths))
              check(f'R15 {currency} {balance}: available stays the largest figure', sizes[0] > max(sizes[1:]), f'font sizes {sizes}')
              ph.close()
      b.close()

finally:
  server.terminate()

failed = 0
for name, (ok, detail) in results.items():
    print(('PASS ' if ok else 'FAIL ') + name + ' — ' + detail)
    failed += not ok
sys.exit(1 if failed else 0)
