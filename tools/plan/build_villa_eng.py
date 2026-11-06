"""build_villa_eng.py <dir с vent.json, vrf.json, blocks.pdf> <public/models/villa>
Инженерные слои клуба VILLA поверх готового club-geom.json (build_geom_villa.py):
  * вентиляция — «Heroes jorney -План этажа.pdf» (A4, вектор): приток = оранжевые контуры коробов (РП, 1.08 pt),
    вытяжка = синие (РВ), тонкие красные/синие 0.24 — круглые ответвления к диффузорам ДП/ДВ; стены — фиолетовая заливка,
    по её габариту лист привязывается к bbox модели;
  * VRF — «Heroes jorney -План этажа_внутрение блоки.pdf» (A3, вектор + растровые стены как на листе 4 альбома):
    внутренние блоки Gree GMV-ND… (подписи-тексты + маджента-прямоугольники), фреоновые трассы — зелёные линии 1.08,
    диаметры — подписи «Ø…/…»; привязка — по габариту растровых стен.
Пишет в club-geom.json: ducts, ductLines, vrf, freon; удаляет gym (просьба шефа 06.11.2026 — тренажёры убрать).
"""
import sys, os, json, math, re, collections
import numpy as np
from scipy import ndimage as ndi
import cv2
import pymupdf
from PIL import Image, ImageDraw

SRC, OUT = sys.argv[1], sys.argv[2]
G = json.load(open(os.path.join(OUT, 'club-geom.json'), encoding='utf-8'))
L = G['levels'][0]; bx0, bz0, bx1, bz1 = L['bbox']
PX = 0.025
W, H = int(bx1 / PX) + 2, int(bz1 / PX) + 2
def dec(t):
    out = ''
    for m in re.finditer(r'\(cid:(\d+)\)|(.)', t):
        if m.group(1):
            c = int(m.group(1)); out += chr(c + 29) if c < 400 else chr(c + 546)
        else: out += m.group(2)
    return out
def room_at(X, Z):
    for r in L['rooms']:
        if r['poly'] and cv2.pointPolygonTest(np.array(r['poly']['outer'], np.float32), (float(X), float(Z)), False) >= 0: return r['no']
    return None
def mask_to_shapes(m, min_area=0.02, simplify_m=0.03):
    cnts, hier = cv2.findContours(m.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    shapes = []
    if hier is None: return shapes
    hier = hier[0]; eps = simplify_m / PX
    def ring(c):
        c = cv2.approxPolyDP(c, eps, True).reshape(-1, 2)
        return [[round(float(x) * PX, 3), round(float(y) * PX, 3)] for x, y in c]
    for i, c in enumerate(cnts):
        if hier[i][3] != -1 or cv2.contourArea(c) * PX * PX < min_area: continue
        r = ring(c)
        if len(r) < 3: continue
        holes = []; j = hier[i][2]
        while j != -1:
            h = ring(cnts[j])
            if len(h) >= 3 and cv2.contourArea(cnts[j]) * PX * PX > 0.01: holes.append(h)
            j = hier[j][0]
        shapes.append({'outer': r, 'holes': holes})
    return shapes

# ======================= вентиляция =======================
V = json.load(open(os.path.join(SRC, 'vent.json'), encoding='utf-8'))
wx = [p[0] for s in V['segs'] if s['f'] == [0.584, 0.29, 0.584] for p in s['pts']]
wy = [p[1] for s in V['segs'] if s['f'] == [0.584, 0.29, 0.584] for p in s['pts']]
vx0, vy0, vx1, vy1 = min(wx), min(wy), max(wx), max(wy)
sx, sz = bx1 / (vx1 - vx0), bz1 / (vy1 - vy0)
print('vent: стены %.1f×%.1f pt -> масштаб %.5f / %.5f м/pt' % (vx1 - vx0, vy1 - vy0, sx, sz))
Tv = lambda x, y: ((x - vx0) * sx, (vy1 - y) * sz)
def raster(polys, width_px):
    im = Image.new('L', (W, H), 0); dr = ImageDraw.Draw(im)
    for pts in polys:
        if len(pts) >= 2: dr.line([(x / PX, z / PX) for x, z in pts], fill=255, width=width_px)
    return np.array(im) > 0
def duct_layer(color, kind):
    lines = [[Tv(*p) for p in s['pts']] for s in V['segs'] if s['c'] == color and s['w'] >= 1.0 and not s['f']]
    lm = raster(lines, 3)
    filled = ndi.binary_fill_holes(lm)
    interior = filled & ~lm
    lab, n = ndi.label(interior)
    dist = ndi.distance_transform_edt(interior) * PX
    keep = np.zeros_like(lm)
    info = []
    for i, sl in enumerate(ndi.find_objects(lab)):
        comp = lab[sl] == i + 1
        area = comp.sum() * PX * PX; md = dist[sl][comp].max()
        if area < 0.03 or md > 0.68: continue       # помещения внутри петель коробов — шире 1.3 м
        keep[sl] |= comp
    ducts = keep | (lm & ndi.binary_dilation(keep, structure=np.ones((3, 3)), iterations=3))
    ducts = ndi.binary_closing(ducts, structure=np.ones((3, 3)), iterations=1)
    shapes = mask_to_shapes(ducts)
    # ширина каждого полигона — по максимуму дистанции внутри него
    out = []
    for sh in shapes:
        m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).polygon([(x / PX, z / PX) for x, z in sh['outer']], fill=255)
        mm = np.array(m) > 0
        wmax = float(ndi.distance_transform_edt(mm).max() * PX * 2)
        cx = sum(p[0] for p in sh['outer']) / len(sh['outer']); cz = sum(p[1] for p in sh['outer']) / len(sh['outer'])
        area = mm.sum() * PX * PX
        out.append({'kind': kind, 'outer': sh['outer'], 'holes': sh['holes'], 'w': round(wmax, 2), 'area': round(area, 2), 'room': room_at(cx, cz)})
    print('  %s: %d полигонов, площадь %.1f м², ширины %s' % (kind, len(out), sum(o['area'] for o in out), sorted(set(o['w'] for o in out))[-6:]))
    return out
ducts = duct_layer([1.0, 0.247, 0.0], 'supply') + duct_layer([0.0, 0.0, 1.0], 'exhaust')
def thin_lines(color, kind):
    out = []
    for s in V['segs']:
        if s['c'] == color and s['w'] < 0.5 and not s['f'] and s['k'] in ('L', 'C'):
            pts = [Tv(*p) for p in s['pts']]
            ln = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:]))
            if ln >= 0.3: out.append({'kind': kind, 'pts': [[round(x, 3), round(z, 3)] for x, z in pts]})
    print('  тонкие линии %s: %d' % (kind, len(out)))
    return out
duct_lines = thin_lines([1.0, 0.0, 0.0], 'supply') + thin_lines([0.0, 0.0, 1.0], 'exhaust')

# ======================= VRF =======================
R = json.load(open(os.path.join(SRC, 'vrf.json'), encoding='utf-8'))
doc = pymupdf.open(os.path.join(SRC, 'blocks.pdf')); page = doc[0]; PH = page.rect.height
PPT = 4
pix = page.get_pixmap(dpi=72 * PPT, alpha=False)
A = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, 3)
r_, g_, b_ = [A[..., i].astype(int) for i in range(3)]
raw = (r_ > 70) & (r_ < 118) & (abs(r_ - g_) < 10) & (abs(g_ - b_) < 10)
raw[int(700 * PPT):, :] = False            # штамп; врезка 1-го этажа слева — векторная, в растровую маску не попадает
raw = ndi.binary_opening(raw, structure=np.ones((3, 3)), iterations=1)
lab, n = ndi.label(raw); sizes = ndi.sum(raw, lab, range(1, n + 1))
raw = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= 150])
ys, xs = np.nonzero(raw)
rx0, rx1 = xs.min() / PPT - 0.5, xs.max() / PPT + 0.5
ry0, ry1 = PH - ys.max() / PPT - 0.5, PH - ys.min() / PPT + 0.5         # pdf-координаты (y снизу)
print('vrf: стены %.1f×%.1f pt (модель %.2f×%.2f м, отношение %.4f / %.4f)' % (rx1 - rx0, ry1 - ry0, bx1, bz1, (rx1 - rx0) / bx1, (ry1 - ry0) / bz1))
Tr = lambda x, y: ((x - rx0) * bx1 / (rx1 - rx0), (ry1 - y) * bz1 / (ry1 - ry0))
# кластеры маджента-элементов -> прямоугольники блоков
mag = [s for s in R['segs'] if s['c'] == [1.0, 0.0, 1.0] or s['f'] == [1.0, 0.0, 1.0]]
cl = []
for s in mag:
    xs_ = [p[0] for p in s['pts']]; ys_ = [p[1] for p in s['pts']]
    bb = [min(xs_), min(ys_), max(xs_), max(ys_)]
    for c in cl:
        if bb[0] <= c[2] + 3 and bb[2] >= c[0] - 3 and bb[1] <= c[3] + 3 and bb[3] >= c[1] - 3:
            c[0] = min(c[0], bb[0]); c[1] = min(c[1], bb[1]); c[2] = max(c[2], bb[2]); c[3] = max(c[3], bb[3]); break
    else: cl.append(bb)
# повторное слияние
merged = True
while merged:
    merged = False
    for i in range(len(cl)):
        for j in range(i + 1, len(cl)):
            a, b = cl[i], cl[j]
            if a[0] <= b[2] + 3 and a[2] >= b[0] - 3 and a[1] <= b[3] + 3 and a[3] >= b[1] - 3:
                cl[i] = [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])]; cl.pop(j); merged = True; break
        if merged: break
boxes = [c for c in cl if c[2] - c[0] >= 6 and c[3] - c[1] >= 6]
print('  маджента-кластеров %d, прямоугольников блоков %d' % (len(cl), len(boxes)))
texts = [dict(t, s=dec(t['t'])) for t in R['texts']]
models = [t for t in texts if re.match(r'^GMV-ND\d+P[HL]S', t['s'])]
loads = [t for t in texts if 'Вт' in t['s']]
units = []
for t in models:
    tx, ty = (t['x'] + t['x1']) / 2, (t['y'] + t['y1']) / 2
    b = min(boxes, key=lambda b: math.hypot((b[0] + b[2]) / 2 - tx, (b[1] + b[3]) / 2 - ty))
    cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
    d = math.hypot(cx - tx, cy - ty)
    if d > 30:   # прямоугольник блока не нашёлся (4 блока нарисованы иначе) — подпись стоит над блоком: центр ≈ (x+25, y−11)
        cx, cy = t['x'] + 25, t['y'] - 11; b = [cx - 7.7, cy - 8.5, cx + 7.7, cy + 8.5]; d = -1
    X, Z = Tr(cx, cy)
    ld = min(loads, key=lambda l: math.hypot((l['x'] + l['x1']) / 2 - cx, (l['y'] + l['y1']) / 2 - cy), default=None)
    ldist = math.hypot((ld['x'] + ld['x1']) / 2 - cx, (ld['y'] + ld['y1']) / 2 - cy) if ld else 999
    model = re.sub(r'(P[HL]S)(B|C)-T', r'\1/\2-T', t['s'])
    units.append({'model': model, 'x': round(X, 2), 'z': round(Z, 2), 'w': round((b[2] - b[0]) * bx1 / (rx1 - rx0), 2), 'd': round((b[3] - b[1]) * bz1 / (ry1 - ry0), 2),
                  'room': room_at(X, Z), 'load': ld['s'].replace(' ', '') if ld and ldist < 60 else None})
    units[-1]['_c'] = (cx, cy)
    print('  блок %-18s текст->бокс %4.1f pt  (%.1f, %.1f) пом. %s  нагрузка %s' % (model, d, X, Z, units[-1]['room'], units[-1]['load']))
# подпись нагрузки принадлежит только ближайшему к ней блоку (у двух блоков одной комнаты — одна подпись на комнату)
for ld in loads:
    lc = ((ld['x'] + ld['x1']) / 2, (ld['y'] + ld['y1']) / 2)
    near = sorted(units, key=lambda u: math.hypot(u['_c'][0] - lc[0], u['_c'][1] - lc[1]))
    for u in near[1:]:
        if u['load'] == ld['s'].replace(' ', ''): u['load'] = None
for u in units: u.pop('_c', None)
# фреоновые трассы
freon = []
dia = [t for t in texts if re.match(r'^.\d+(\.\d+)?/\d', t['s'])]
for s in R['segs']:
    if s['c'] == [0.0, 1.0, 0.0] and s['w'] >= 1.0 and not s['f']:
        pts = [Tr(*p) for p in s['pts']]
        ln = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:]))
        if ln < 0.2: continue
        mid = s['pts'][len(s['pts']) // 2]
        lb = min(dia, key=lambda t: math.hypot((t['x'] + t['x1']) / 2 - mid[0], (t['y'] + t['y1']) / 2 - mid[1]), default=None)
        ldist = math.hypot((lb['x'] + lb['x1']) / 2 - mid[0], (lb['y'] + lb['y1']) / 2 - mid[1]) if lb else 999
        freon.append({'pts': [[round(x, 3), round(z, 3)] for x, z in pts], 'dia': ('Ø' + lb['s'][1:]) if lb and ldist < 45 else None})
print('  фреоновых линий %d, общая длина %.1f м; выход за план: %s' % (len(freon), sum(sum(math.hypot(b[0]-a[0], b[1]-a[1]) for a, b in zip(f['pts'], f['pts'][1:])) for f in freon),
      [p for f in freon for p in f['pts'] if p[1] < 0 or p[0] < 0 or p[0] > bx1 or p[1] > bz1][:4]))

# ======================= запись + контроль =======================
L['ducts'] = ducts; L['ductLines'] = duct_lines; L['vrf'] = units; L['freon'] = freon
L.pop('gym', None)
json.dump(G, open(os.path.join(OUT, 'club-geom.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
chk = Image.new('RGB', (W, H), (245, 245, 245)); cd = ImageDraw.Draw(chk)
for poly in L['walls']: cd.polygon([(x / PX, z / PX) for x, z in poly['outer']], fill=(120, 120, 120))
for d in ducts: cd.polygon([(x / PX, z / PX) for x, z in d['outer']], fill=(255, 120, 40) if d['kind'] == 'supply' else (60, 90, 255))
for l in duct_lines: cd.line([(x / PX, z / PX) for x, z in l['pts']], fill=(255, 0, 0) if l['kind'] == 'supply' else (0, 0, 255), width=2)
for f in freon: cd.line([(x / PX, z / PX) for x, z in f['pts']], fill=(0, 200, 0), width=3)
for u in units: cd.rectangle([u['x'] / PX - 12, u['z'] / PX - 12, u['x'] / PX + 12, u['z'] / PX + 12], outline=(255, 0, 255), width=3); cd.text((u['x'] / PX + 14, u['z'] / PX - 6), u['model'], fill=(160, 0, 160))
chk.save(os.path.join(SRC, 'check-eng.png'))
print('ok ->', OUT)
