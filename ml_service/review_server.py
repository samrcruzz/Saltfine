"""
SALTFINE - local review page for auto-labelled impurities (runs only on this PC)

Opens http://127.0.0.1:8765 in your browser. For each photo of a batch you see
the auto labels and fix them:
  drag on the photo        add a box (mode: impurity / uncertain)
  click a box + Delete     remove it              (Backspace also works)
  mouse wheel              zoom    | right-drag or Space+drag: pan | 0: fit
  N / P  (or arrows)       next / previous photo
  S                        show/hide salt boxes (auto, read-only)
  X                        exclude/include this photo (bad photo -> not used)
  I / U                    draw mode impurity / uncertain
Every change is saved to the batch's impurities_manual.json immediately.
"Finish review" marks the batch reviewed and stops the server.

Usage:  python review_server.py --batch batch-2      (pipeline.py auto runs this for you)
"""

import argparse
import json
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

from PIL import Image

BASE = Path(__file__).resolve().parent
REPO = BASE.parent
WORK_W = 2016


def dump_boxes(data: dict) -> str:
    rows = [f"  {json.dumps(k)}: {json.dumps(v)}" for k, v in data.items()]
    return "{\n" + ",\n".join(rows) + "\n}\n"


class Review:
    def __init__(self, batch: dict, name: str):
        self.name = name
        self.img_dir = REPO / batch["images"]
        self.lbl_dir = REPO / batch["labels"]
        self.json_path = REPO / batch["impurities"]
        self.data = json.loads(self.json_path.read_text()) if self.json_path.exists() else {}
        self.photos = []
        for p in sorted(self.img_dir.glob("*.jpg")):
            with Image.open(p) as im:  # header only: exact size without decoding
                w, h = im.size
            self.photos.append({"stem": p.stem, "w": w, "h": h})
        self.finished = threading.Event()
        self.lock = threading.Lock()

    def state(self):
        unc = self.data.get("_uncertain", {})
        return {
            "batch": self.name, "work_w": WORK_W, "photos": self.photos,
            "impurities": {p["stem"]: self.data.get(p["stem"], []) for p in self.photos},
            "uncertain": {p["stem"]: unc.get(p["stem"], []) for p in self.photos},
            "excluded": self.data.get("_excluded", []),
            "reviewed": self.data.get("_reviewed", []),
        }

    def salt(self, stem):
        f = self.lbl_dir / f"{stem}.txt"
        if not f.exists():
            return []
        out = []
        for line in f.read_text().splitlines():
            parts = line.split()
            if len(parts) == 5 and parts[0] == "0":
                out.append([float(v) for v in parts[1:]])
        return out

    def save(self, body):
        stem = body["stem"]
        with self.lock:
            self.data[stem] = [[int(round(v)) for v in b] for b in body["impurities"]]
            unc = self.data.setdefault("_uncertain", {})
            if body["uncertain"]:
                unc[stem] = [[int(round(v)) for v in b] for b in body["uncertain"]]
            else:
                unc.pop(stem, None)
            excl = set(self.data.get("_excluded", []))
            excl.add(stem) if body["excluded"] else excl.discard(stem)
            self.data["_excluded"] = sorted(excl)
            seen = set(self.data.get("_reviewed", []))
            seen.add(stem)
            self.data["_reviewed"] = sorted(seen)
            self.json_path.write_text(dump_boxes(self.data))


def make_handler(rv: Review):
    class H(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def _send(self, code, body, ctype="application/json"):
            data = body if isinstance(body, bytes) else body.encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            path = unquote(self.path.split("?")[0])
            if path == "/":
                return self._send(200, PAGE, "text/html; charset=utf-8")
            if path == "/api/state":
                return self._send(200, json.dumps(rv.state()))
            if path.startswith("/api/salt/"):
                return self._send(200, json.dumps(rv.salt(path[len("/api/salt/"):])))
            if path.startswith("/img/"):
                f = (rv.img_dir / Path(path[len("/img/"):]).name)
                if f.suffix.lower() == ".jpg" and f.exists():
                    return self._send(200, f.read_bytes(), "image/jpeg")
            self._send(404, '{"error":"not found"}')

        def do_POST(self):
            n = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(n) or b"{}")
            if self.path == "/api/save":
                rv.save(body)
                return self._send(200, '{"ok":true}')
            if self.path == "/api/finish":
                self._send(200, '{"ok":true}')
                rv.finished.set()
                return
            self._send(404, '{"error":"not found"}')

    return H


def run_review(batch: dict, name: str, port: int = 8765, open_browser: bool = True) -> dict:
    """Blocks until the user clicks 'Finish review'. Returns the saved JSON data."""
    rv = Review(batch, name)
    srv = ThreadingHTTPServer(("127.0.0.1", port), make_handler(rv))
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    url = f"http://127.0.0.1:{port}/"
    print(f"[*] REVIEW: {url}  ({len(rv.photos)} photos). Fix the boxes, then click 'Finish review'.")
    if open_browser:
        webbrowser.open(url)
    try:
        rv.finished.wait()
    except KeyboardInterrupt:
        print("\n[!] review interrupted; progress so far is saved. Run the same command again to continue.")
        srv.shutdown()
        raise SystemExit(1)
    srv.shutdown()
    print("[*] review finished")
    return rv.data


PAGE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>SALTFINE review</title>
<style>
  :root { --bg:#14161a; --panel:#1d2026; --ink:#e8e8ea; --dim:#9aa0aa; --red:#e53935; --amber:#ffb300; --green:#2fbf4f; }
  * { box-sizing:border-box }
  body { margin:0; background:var(--bg); color:var(--ink); font:14px system-ui,sans-serif; display:flex; height:100vh; overflow:hidden }
  #side { width:260px; background:var(--panel); display:flex; flex-direction:column; border-right:1px solid #2a2e36 }
  #side h1 { font-size:15px; margin:14px 14px 4px } #side .sub { color:var(--dim); margin:0 14px 10px; font-size:12px }
  #list { flex:1; overflow:auto }
  .item { padding:7px 14px; cursor:pointer; display:flex; justify-content:space-between; gap:8px; border-left:3px solid transparent }
  .item:hover { background:#252932 } .item.on { background:#2b303a; border-left-color:var(--red) }
  .item .meta { color:var(--dim); font-size:12px; white-space:nowrap } .item.excl .name { text-decoration:line-through; color:var(--dim) }
  .dot { display:inline-block; width:8px; height:8px; border-radius:50%; background:#555; margin-right:6px } .dot.ok { background:var(--green) }
  #finish { margin:12px; padding:10px; border:0; border-radius:6px; background:var(--green); color:#06210d; font-weight:700; cursor:pointer }
  #main { flex:1; display:flex; flex-direction:column; min-width:0 }
  #bar { display:flex; gap:6px; align-items:center; padding:8px 10px; background:var(--panel); border-bottom:1px solid #2a2e36; flex-wrap:wrap }
  #bar button { background:#2b303a; color:var(--ink); border:1px solid #3a404c; border-radius:5px; padding:5px 10px; cursor:pointer }
  #bar button.on { outline:2px solid var(--red) } #bar button.amber.on { outline-color:var(--amber) }
  #bar .sp { flex:1 } #status { color:var(--dim); font-size:12px }
  #wrap { flex:1; position:relative; overflow:hidden; cursor:crosshair } canvas { position:absolute; inset:0 }
  #help { color:var(--dim); font-size:12px; padding:6px 10px; background:var(--panel); border-top:1px solid #2a2e36 }
  kbd { background:#2b303a; border:1px solid #3a404c; border-radius:3px; padding:0 4px; font-size:11px }
</style></head><body>
<div id="side"><h1>SALTFINE review</h1><div class="sub" id="sub"></div><div id="list"></div>
  <button id="finish">Finish review ▶ train</button></div>
<div id="main">
  <div id="bar">
    <button id="prev">◀ Prev</button><button id="next">Next ▶</button>
    <button id="mImp" class="on">Draw: impurity</button><button id="mUnc" class="amber">Draw: uncertain</button>
    <button id="del">Delete selected</button><button id="salt">Salt boxes: on</button>
    <button id="excl">Exclude photo</button><button id="fit">Fit</button>
    <span class="sp"></span><span id="status"></span>
  </div>
  <div id="wrap"><canvas id="cv"></canvas></div>
  <div id="help"><kbd>drag</kbd> add box · <kbd>click</kbd> select · <kbd>Del</kbd> remove · <kbd>wheel</kbd> zoom · <kbd>right-drag</kbd>/<kbd>Space+drag</kbd> pan · <kbd>0</kbd> fit · <kbd>N</kbd>/<kbd>P</kbd> next/prev · <kbd>I</kbd>/<kbd>U</kbd> mode · <kbd>S</kbd> salt · <kbd>X</kbd> exclude. Red = impurity (trained), amber = uncertain (not trained, kept out of pure-salt images).</div>
</div>
<script>
const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d'), wrap = $('wrap');
let S, idx = 0, img = new Image(), salt = [], showSalt = true, mode = 'imp', sel = null;
let view = {s: 1, x: 0, y: 0}, drag = null, space = false, scaleK = 1;  // scaleK: work-px -> image px

async function load() {
  S = await (await fetch('/api/state')).json();
  $('sub').textContent = `${S.batch} · ${S.photos.length} photos`;
  renderList(); open(0);
}
function cur() { return S.photos[idx]; }
function boxes(kind) { return (kind === 'imp' ? S.impurities : S.uncertain)[cur().stem]; }
function renderList() {
  $('list').innerHTML = '';
  S.photos.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'item' + (i === idx ? ' on' : '') + (S.excluded.includes(p.stem) ? ' excl' : '');
    const ok = S.reviewed.includes(p.stem);
    d.innerHTML = `<span class="name"><span class="dot ${ok ? 'ok' : ''}"></span>${p.stem}</span><span class="meta">${S.impurities[p.stem].length} imp</span>`;
    d.onclick = () => open(i);
    $('list').appendChild(d);
  });
  const done = S.photos.filter(p => S.reviewed.includes(p.stem)).length;
  $('finish').textContent = `Finish review ▶ train  (${done}/${S.photos.length} checked)`;
}
async function open(i) {
  idx = (i + S.photos.length) % S.photos.length; sel = null;
  const p = cur(); scaleK = p.w / S.work_w;
  img = new Image(); img.onload = () => { fit(); draw(); status(); }; img.src = '/img/' + encodeURIComponent(p.stem) + '.jpg';
  salt = await (await fetch('/api/salt/' + encodeURIComponent(p.stem))).json();
  $('excl').textContent = S.excluded.includes(p.stem) ? 'Include photo' : 'Exclude photo';
  renderList(); await save(); status();
}
function fit() {
  cv.width = wrap.clientWidth; cv.height = wrap.clientHeight;
  const s = Math.min(cv.width / img.width, cv.height / img.height);
  view = {s, x: (cv.width - img.width * s) / 2, y: (cv.height - img.height * s) / 2};
}
function toImg(px, py) { return [(px - view.x) / view.s, (py - view.y) / view.s]; }
function draw() {
  if (!S) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#0d0e11'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(view.s, 0, 0, view.s, view.x, view.y);
  if (img.complete) ctx.drawImage(img, 0, 0);
  const lw = 1 / view.s;
  if (showSalt) {
    ctx.strokeStyle = 'rgba(47,191,79,.8)'; ctx.lineWidth = lw;
    for (const [cx, cy, w, h] of salt) ctx.strokeRect((cx - w / 2) * img.width, (cy - h / 2) * img.height, w * img.width, h * img.height);
  }
  for (const kind of ['unc', 'imp']) {
    boxes(kind).forEach((b, i) => {
      const [x1, y1, x2, y2] = b.map(v => v * scaleK);
      const isSel = sel && sel.kind === kind && sel.i === i;
      ctx.lineWidth = (isSel ? 5 : 3) * lw;
      ctx.strokeStyle = kind === 'imp' ? (isSel ? '#ff8a80' : '#e53935') : (isSel ? '#ffe082' : '#ffb300');
      if (kind === 'unc') ctx.setLineDash([8 * lw, 5 * lw]);
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1); ctx.setLineDash([]);
      const tag = kind === 'imp' ? 'impurity' : 'uncertain';
      ctx.font = `${13 * lw}px system-ui`; const tw = ctx.measureText(tag).width;
      ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(x1, y1 - 17 * lw, tw + 8 * lw, 17 * lw);
      ctx.fillStyle = kind === 'imp' ? '#fff' : '#201600'; ctx.fillText(tag, x1 + 4 * lw, y1 - 4 * lw);
    });
  }
  if (drag && drag.type === 'box') {
    ctx.lineWidth = 2 * lw; ctx.strokeStyle = mode === 'imp' ? '#e53935' : '#ffb300'; ctx.setLineDash([6 * lw, 4 * lw]);
    ctx.strokeRect(drag.x0, drag.y0, drag.x1 - drag.x0, drag.y1 - drag.y0); ctx.setLineDash([]);
  }
  if (S.excluded.includes(cur().stem)) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, cv.width, 44);
    ctx.fillStyle = '#ffb300'; ctx.font = 'bold 18px system-ui'; ctx.fillText('EXCLUDED - this photo will not be used for training', 14, 29);
  }
}
function status(msg) {
  const p = cur();
  $('status').textContent = msg || `${idx + 1}/${S.photos.length} · ${p.stem} · ${boxes('imp').length} impurity · ${boxes('unc').length} uncertain · zoom ${(view.s * 100 | 0)}%`;
}
async function save() {
  const p = cur();
  await fetch('/api/save', {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({stem: p.stem, impurities: S.impurities[p.stem], uncertain: S.uncertain[p.stem], excluded: S.excluded.includes(p.stem)})});
  if (!S.reviewed.includes(p.stem)) S.reviewed.push(p.stem);
  renderList(); status('saved ✓'); setTimeout(() => status(), 900);
}
function hit(ix, iy) {
  for (const kind of ['imp', 'unc']) {
    const bs = boxes(kind);
    for (let i = bs.length - 1; i >= 0; i--) {
      const [x1, y1, x2, y2] = bs[i].map(v => v * scaleK);
      if (ix >= x1 && ix <= x2 && iy >= y1 && iy <= y2) return {kind, i};
    }
  }
  return null;
}
function setMode(m) { mode = m; $('mImp').classList.toggle('on', m === 'imp'); $('mUnc').classList.toggle('on', m === 'unc'); }
function delSel() { if (!sel) return; boxes(sel.kind).splice(sel.i, 1); sel = null; draw(); save(); }
function toggleExcl() {
  const st = cur().stem, i = S.excluded.indexOf(st);
  i >= 0 ? S.excluded.splice(i, 1) : S.excluded.push(st);
  $('excl').textContent = i >= 0 ? 'Exclude photo' : 'Include photo'; draw(); save();
}

cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('mousedown', e => {
  const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  if (e.button === 2 || space) { drag = {type: 'pan', px, py, vx: view.x, vy: view.y}; return; }
  const [ix, iy] = toImg(px, py);
  drag = {type: 'box', x0: ix, y0: iy, x1: ix, y1: iy, px, py};
});
window.addEventListener('mousemove', e => {
  if (!drag) return;
  const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  if (drag.type === 'pan') { view.x = drag.vx + px - drag.px; view.y = drag.vy + py - drag.py; }
  else { const [ix, iy] = toImg(px, py); drag.x1 = ix; drag.y1 = iy; }
  draw();
});
window.addEventListener('mouseup', e => {
  if (!drag) return;
  const d = drag; drag = null;
  if (d.type === 'box') {
    const r = cv.getBoundingClientRect(), moved = Math.hypot(e.clientX - r.left - d.px, e.clientY - r.top - d.py);
    if (moved < 4) { sel = hit(d.x0, d.y0); draw(); status(); return; }
    const k = 1 / scaleK, x1 = Math.min(d.x0, d.x1), x2 = Math.max(d.x0, d.x1), y1 = Math.min(d.y0, d.y1), y2 = Math.max(d.y0, d.y1);
    const b = [x1 * k, y1 * k, x2 * k, y2 * k].map(v => Math.max(0, Math.round(v)));
    b[2] = Math.min(b[2], S.work_w); b[3] = Math.min(b[3], Math.round(img.height / scaleK));
    if (b[2] - b[0] >= 3 && b[3] - b[1] >= 3) { boxes(mode).push(b); sel = {kind: mode, i: boxes(mode).length - 1}; save(); }
  }
  draw();
});
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  const f = Math.exp(-e.deltaY * 0.0015), s = Math.min(Math.max(view.s * f, 0.05), 8);
  view.x = px - (px - view.x) * s / view.s; view.y = py - (py - view.y) * s / view.s; view.s = s; draw(); status();
}, {passive: false});
window.addEventListener('keydown', e => {
  if (e.key === ' ') { space = true; e.preventDefault(); return; }
  const k = e.key.toLowerCase();
  if (k === 'delete' || k === 'backspace') delSel();
  else if (k === 'n' || k === 'arrowright') open(idx + 1);
  else if (k === 'p' || k === 'arrowleft') open(idx - 1);
  else if (k === 's') $('salt').click();
  else if (k === 'x') toggleExcl();
  else if (k === 'i') setMode('imp');
  else if (k === 'u') setMode('unc');
  else if (k === '0') { fit(); draw(); status(); }
});
window.addEventListener('keyup', e => { if (e.key === ' ') space = false; });
window.addEventListener('resize', () => { fit(); draw(); });
$('prev').onclick = () => open(idx - 1); $('next').onclick = () => open(idx + 1);
$('mImp').onclick = () => setMode('imp'); $('mUnc').onclick = () => setMode('unc');
$('del').onclick = delSel; $('excl').onclick = toggleExcl; $('fit').onclick = () => { fit(); draw(); };
$('salt').onclick = () => { showSalt = !showSalt; $('salt').textContent = 'Salt boxes: ' + (showSalt ? 'on' : 'off'); draw(); };
$('finish').onclick = async () => {
  const left = S.photos.filter(p => !S.reviewed.includes(p.stem)).length;
  if (left && !confirm(`${left} photo(s) not opened yet. Finish anyway?`)) return;
  await fetch('/api/finish', {method: 'POST'});
  document.body.innerHTML = '<div style="margin:auto;text-align:center"><h2>Review saved ✓</h2><p style="color:#9aa0aa">You can close this tab. The pipeline continues in the terminal: labels → augment → fine-tune → compare.</p></div>';
};
load();
</script></body></html>
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--batch", required=True)
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()
    from make_yolo_split import load_registry

    reg = load_registry()
    if args.batch not in reg["batches"]:
        raise SystemExit(f"Unknown batch {args.batch}")
    run_review(reg["batches"][args.batch], args.batch, args.port, not args.no_browser)


if __name__ == "__main__":
    main()
