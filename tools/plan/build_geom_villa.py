"""build_geom_villa.py <dir с p4/p8/p10/p61.json> <out dir> <альбом.pdf>
Геометрия клуба VILLA (Алматы) из альбома дизайн-проекта Design-Studio Irina Simonyan-Sokolova (10.12.2024, 76 листов, dump.py).
Клуб занимает цокольный этаж (872.9 м², 15 помещений по экспликации листа 4), вход — по лестнице (16 ступеней) и лифту с 1-го этажа.
Инженерных проектов (ОВ/ВК/ЭОМ) в альбоме нет: берём стены (лист 4, серая штриховка), колонны и пожарные краны (красная штриховка),
помещения (подписи листа 4 + отметки потолков листа 10), сантехнику (лист 8: синие/красные выводы + «прим.N»), тренажёры и мебель (лист 61 — план мебели и оборудования).
Система координат модели: X вправо по плану (запад → восток), Z вниз по плану (север → юг), Y вверх; 0/0 — наружный угол здания
(северо-западный, у эвакуационной лестницы). Масштаб считается по мерному плану: ширина зала Fullbody между стенами 22 214 мм (лист 3).
"""
import sys, os, json, math, re, collections
import numpy as np
from scipy import ndimage as ndi
import cv2
from PIL import Image, ImageDraw
import pymupdf

SRC, OUT, PDF = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)
GREY = [0.576, 0.584, 0.596]
def load(p): return json.load(open(os.path.join(SRC, 'p%d.json' % p), encoding='utf-8'))

def hatch(d):
    return [s for s in d['segs'] if s['k'] in ('L', 'C') and s['w'] == 0 and s['c'] == GREY and not s['f']]
def bbox_of(segs):
    xs = [x for s in segs for x, y in s['pts']]; ys = [y for s in segs for x, y in s['pts']]
    return min(xs), min(ys), max(xs), max(ys)

P4 = load(4); H4 = hatch(P4); HB4 = bbox_of(H4)
print('p4 hatch bbox', [round(v, 1) for v in HB4])
# все листы несут один и тот же блок плана, но в разном масштабе/смещении -> приводим к рамке листа 4
# по bbox серых линий оборудования (один и тот же блок на всех листах)
def frame(p):
    d = load(p); b = bbox_of(hatch(d))
    sx = (HB4[2] - HB4[0]) / (b[2] - b[0]); sy = (HB4[3] - HB4[1]) / (b[3] - b[1])
    print('p%d frame: bbox %s scale %.4f/%.4f' % (p, [round(v, 1) for v in b], sx, sy))
    return d, (lambda x, y: (HB4[0] + (x - b[0]) * sx, HB4[1] + (y - b[1]) * sy))

# ---------- стены: на листе 4 они не векторные, а растровые (тёмно-серая заливка RGB 96/96/96) -> рендер страницы 4 px/pt ----------
PPT = 4.0                                   # px / pt
doc = pymupdf.open(PDF); page = doc[3]; PH = page.rect.height
pix = page.get_pixmap(dpi=int(72 * PPT), alpha=False)
A = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, 3)
r, g, b = [A[..., i].astype(int) for i in range(3)]
raw = (r > 70) & (r < 118) & (abs(r - g) < 10) & (abs(g - b) < 10)
raw[:, :int(300 * PPT)] = False              # врезка 1-го этажа слева от плана
raw[int(700 * PPT):, :] = False              # штамп внизу
raw = ndi.binary_opening(raw, structure=np.ones((3, 3)), iterations=1)
lab, n = ndi.label(raw); sizes = ndi.sum(raw, lab, range(1, n + 1))
raw = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= 150])
ys, xs = np.nonzero(raw)
# рамка здания в координатах pdf (y снизу): B4 переопределяем на габарит стен
B4 = (xs.min() / PPT - 0.5, PH - ys.max() / PPT - 0.5, xs.max() / PPT + 0.5, PH - ys.min() / PPT + 0.5)
print('габарит стен (pt, pdf-координаты):', [round(v, 1) for v in B4])
W = int((B4[2] - B4[0]) * PPT) + 3; H = int((B4[3] - B4[1]) * PPT) + 3
def px(x, y): return ((x - B4[0]) * PPT, (B4[3] - y) * PPT)
walls = np.zeros((H, W), bool)
sy0, sx0 = int((PH - B4[3]) * PPT), int(B4[0] * PPT)
sub = raw[sy0:sy0 + H, sx0:sx0 + W]; walls[:sub.shape[0], :sub.shape[1]] = sub
walls = ndi.binary_closing(walls, structure=np.ones((3, 3)), iterations=1)

# ---------- масштаб: ряд у северной стены зала Fullbody (y≈745 pt) — тех. помещение (стена ~x 633–637) и наружная стена справа ----------
def runs(row):
    out = []; on = False
    for i, v in enumerate(row):
        if v and not on: on = True; a = i
        elif not v and on: on = False; out.append((a, i - 1))
    if on: out.append((a, len(row) - 1))
    return out
def row_at(ypt): return runs(walls[int((B4[3] - ypt) * PPT)])
for ypt in (745, 700, 520, 450):
    print('runs y=%d:' % ypt, [(round(B4[0] + a / PPT, 1), round(B4[0] + b / PPT, 1)) for a, b in row_at(ypt) if b - a > 2])
rr = [(B4[0] + a / PPT, B4[0] + b / PPT) for a, b in row_at(745) if b - a > 2]
try:
    right_face = min(a for a, b in rr if a > 1050)                 # внутренняя грань наружной восточной стены
    tech_face = max(b for a, b in rr if 600 < b < 660)             # восточная грань стены тех. помещения
    S = 22.214 / (right_face - tech_face)
    print('right face %.1f  tech face %.1f  -> S = %.5f m/pt (1 м = %.2f pt)' % (right_face, tech_face, S, 1 / S))
except ValueError:
    S = 0.04861; print('!! не нашёл грани для масштаба, беру S =', S)
PXM = S / PPT                                                  # м / px
def m_of_px(cx, cy): return (round(cx * PXM, 3), round(cy * PXM, 3))
def m_of_pt(x, y): return ((x - B4[0]) * S, (B4[3] - y) * S)
WM, HM = W * PXM, H * PXM
print('план %.1f × %.1f м' % (WM, HM))

# ---------- колонны и пожарные краны: красная штриховка листа 4 ----------
red = [s for s in P4['segs'] if s['c'] == [0.804, 0.125, 0.153] and s['w'] == 0.12]
rim = Image.new('L', (W, H), 0); rdr = ImageDraw.Draw(rim)
for s in red:
    pts = [px(*p) for p in s['pts']]
    if len(pts) >= 2: rdr.line(pts, fill=255, width=3)
rmask = ndi.binary_closing(np.array(rim) > 0, structure=np.ones((5, 5)), iterations=2)
rmask = ndi.binary_fill_holes(rmask)
lab, n = ndi.label(rmask)
columns, hydrants = [], []
for i, sl in enumerate(ndi.find_objects(lab)):
    ys, xs = sl; w = (xs.stop - xs.start) * PXM; h = (ys.stop - ys.start) * PXM
    cx, cz = m_of_px((xs.start + xs.stop) / 2, (ys.start + ys.stop) / 2)
    if w < 0.15 or h < 0.15: continue
    rect = [[round(xs.start * PXM, 3), round(ys.start * PXM, 3)], [round(xs.stop * PXM, 3), round(ys.start * PXM, 3)],
            [round(xs.stop * PXM, 3), round(ys.stop * PXM, 3)], [round(xs.start * PXM, 3), round(ys.stop * PXM, 3)]]
    if min(w, h) >= 0.38: columns.append({'outer': rect, 'holes': [], 'w': round(w, 2), 'd': round(h, 2)})
    else: hydrants.append({'x': cx, 'z': cz, 'w': round(w, 2), 'd': round(h, 2)})
print('колонны:', len(columns), [(c['w'], c['d']) for c in columns])
print('пожарные краны (ПК):', len(hydrants), [(h['x'], h['z'], h['w'], h['d']) for h in hydrants])
for c in columns:   # колонны — в маску стен
    (x0, z0), (x1, z1) = c['outer'][0], c['outer'][2]
    walls[int(z0 / PXM):int(z1 / PXM) + 1, int(x0 / PXM):int(x1 / PXM) + 1] = True

# ---------- стены -> полигоны ----------
def mask_to_shapes(m, min_area=0.04, simplify_m=0.02):
    lab, n = ndi.label(m)
    sizes = ndi.sum(m, lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s * PXM * PXM >= min_area])
    cnts, hier = cv2.findContours(keep.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    shapes = []
    if hier is None: return shapes, keep
    hier = hier[0]; eps = simplify_m / PXM
    def ring(c):
        c = cv2.approxPolyDP(c, eps, True).reshape(-1, 2)
        return [[round(float(x) * PXM, 3), round(float(y) * PXM, 3)] for x, y in c]
    for i, c in enumerate(cnts):
        if hier[i][3] != -1: continue
        r = ring(c)
        if len(r) < 3: continue
        holes = []; j = hier[i][2]
        while j != -1:
            h = ring(cnts[j])
            if len(h) >= 3 and cv2.contourArea(cnts[j]) * PXM * PXM > 0.02: holes.append(h)
            j = hier[j][0]
        shapes.append({'outer': r, 'holes': holes})
    return shapes, keep
wall_shapes, wmask = mask_to_shapes(walls)
print('стены: %d полигонов, площадь %.1f м²' % (len(wall_shapes), wmask.sum() * PXM * PXM))

# ---------- помещения: подписи листа 4 + заливка свободного пространства между стенами ----------
ROOMS = [  # (№, имя, площадь по экспликации, якорь-текст на листе 4)
    (1, 'Reception', 6.1, '6,1м2'), (2, 'Отдел продаж', 13.4, '13,4м2'), (3, 'Зона хранения чистых полотенец', 6.4, '6,4м2'),
    (4, 'Комната персонала', 6.7, '6,7м2'), (5, 'Электрощитовая', 2.4, '2,4м2'), (6, 'ПУИ (уборочный инвентарь)', 4.4, '4,4м2'),
    (7, 'Женская раздевалка', 113.8, '113,8м2'), (8, 'Коридор №1', 33.2, '33,2м2'), (9, 'Коридор №2', 36.3, '36,3м2'),
    (10, 'Мужская раздевалка', 74.5, '74,5м2'), (11, 'Зал Fullbody', 235.5, '235,5м2'), (12, 'Зал Pilates', 84.2, '84,2м2'),
    (13, 'Зал Bootcamp', 105.3, '105,3м2'), (14, 'Вентиляционная', 15.3, '15,3м2'), (15, 'Подсобное помещение', 5.2, '5,2м2'),
]
def find_text(d, key):
    for t in d['texts']:
        if key in t['t']: return ((t['x'] + t['x1']) / 2, (t['y'] + t['y1']) / 2)
    raise KeyError(key)
# Автоподбор по заливке между стенами не работает (проёмы 2.3 м сливают комнаты), поэтому контуры заданы вручную
# по планировке листа 4 (метры модели, снято с контрольной картинки); из прямоугольника вычитаются стены и
# уже назначенные (меньшие) помещения — так женская раздевалка получает свою L-форму без комнат персонала.
RECTS = {   # №: список точек полигона [x,z] (м); прямоугольник = 2 точки
    1: [[5.0, 16.4], [7.6, 18.3]], 2: [[0.8, 15.0], [4.9, 18.3]], 3: [[4.0, 14.1], [6.6, 16.5]], 4: [[2.4, 12.1], [6.4, 13.8]],
    5: [[0.8, 12.0], [2.4, 13.6]], 6: [[9.9, 16.3], [11.9, 18.3]], 7: [[0.8, 10.2], [20.5, 18.4]], 8: [[0.8, 18.4], [16.5, 20.9]],
    9: [[18.0, 17.9], [31.8, 20.3]], 10: [[7.6, 21.3], [15.8, 30.0]], 11: [[20.7, 1.2], [38.5, 1.2], [38.5, 10.4], [31.5, 10.4], [31.5, 18.0], [20.7, 18.0]],
    12: [[18.4, 20.1], [31.5, 26.8]], 13: [[31.5, 10.4], [38.5, 26.8]], 14: [[15.9, 27.1], [21.6, 30.2]], 15: [[15.4, 6.6], [17.6, 9.1]],
    16: [[15.7, 1.1], [20.7, 6.6]], 17: [[0.8, 21.3], [7.5, 30.3]], 18: [[10.8, 0.0], [15.4, 9.6]],
}
ROOMS += [(16, 'Тех. помещение — вентиляционная №2 (общая с ресторанами)', None, None),
          (17, 'Лифт и лестница на 1 этаж', None, None), (18, 'Эвакуационная лестница (EXIT)', None, None)]
rooms = []; roommask = np.zeros_like(wmask, dtype=np.int16)
order = sorted(ROOMS, key=lambda r: (r[2] or 999))           # маленькие комнаты назначаем первыми
for no, name, area, key in order:
    pts = RECTS[no]
    if len(pts) == 2: pts = [[pts[0][0], pts[0][1]], [pts[1][0], pts[0][1]], [pts[1][0], pts[1][1]], [pts[0][0], pts[1][1]]]
    rm = Image.new('L', (W, H), 0); ImageDraw.Draw(rm).polygon([(x / PXM, z / PXM) for x, z in pts], fill=255)
    comp = (np.array(rm) > 0) & ~wmask & (roommask == 0)
    lab_, n_ = ndi.label(comp)
    if n_ > 1:
        sizes_ = ndi.sum(comp, lab_, range(1, n_ + 1)); comp = lab_ == (int(np.argmax(sizes_)) + 1)
    comp = ndi.binary_fill_holes(comp)
    shp, cm = mask_to_shapes(comp, min_area=0.3, simplify_m=0.04)
    poly = max(shp, key=lambda s: cv2.contourArea(np.array(s['outer'], np.float32))) if shp else None
    area_m = round(float(cm.sum()) * PXM * PXM, 1)
    ys_, xs_ = np.nonzero(cm); X, Z = float(xs_.mean() * PXM), float(ys_.mean() * PXM)
    roommask[cm] = no
    rooms.append({'no': no, 'n': name, 'area': area, 'areaCalc': area_m, 'x': round(X, 2), 'z': round(Z, 2), 'poly': poly})
    print('  %2d %-32s %6s м²  по маске %s  центр (%.1f, %.1f)' % (no, name[:32], area, area_m, X, Z))
rooms.sort(key=lambda r: r['no'])
def room_at(X, Z):
    cx, cy = int(X / PXM), int(Z / PXM)
    if 0 <= cy < H and 0 <= cx < W and roommask[cy, cx]: return int(roommask[cy, cx])
    best = None
    for r in rooms:
        if r['poly'] and cv2.pointPolygonTest(np.array(r['poly']['outer'], np.float32), (float(X), float(Z)), False) >= 0: return r['no']
    return None

# ---------- отметки потолков (лист 10) -> ближайшее помещение ----------
P10, T10 = frame(10)
ceil = collections.defaultdict(list)
for t in P10['texts']:
    if re.match(r'^\+\d,\d{3}$', t['t']):
        X, Z = m_of_pt(*T10((t['x'] + t['x1']) / 2, (t['y'] + t['y1']) / 2))
        no = room_at(X, Z)
        if no: ceil[no].append(t['t'])
for r in rooms:
    c = collections.Counter(ceil.get(r['no'], []))
    r['ceil'] = [k for k, _ in c.most_common()]
    print('  потолок %2d %-28s %s' % (r['no'], r['n'], ' '.join('%s×%d' % kv for kv in c.most_common())))

# ---------- сантехника (лист 8): синие/красные выводы, тип по ближайшему «прим.N» ----------
P8, T8 = frame(8)
NOTE = {1: 'Подвесной унитаз (инсталляция)', 2: 'Раковина (встроенный настенный смеситель)', 3: 'Душевая система + лейка (трап щелевой)',
        4: 'Ручной душ для душевого поддона', 5: 'Пурифайер (вывод холодной воды)'}
notes = [(int(t['t'][-1]), m_of_pt(*T8((t['x'] + t['x1']) / 2, (t['y'] + t['y1']) / 2))) for t in P8['texts'] if re.match(r'^прим\.\d$', t['t'])]
pts = []
for s in P8['segs']:
    if s['k'] == 'C' and s['f'] in ([0.0, 0.0, 1.0], [1.0, 0.0, 0.0]) and len(s['pts']) >= 3:
        xs = [p[0] for p in s['pts']]; ys = [p[1] for p in s['pts']]
        if max(xs) - min(xs) < 6 and max(ys) - min(ys) < 6:
            pts.append(m_of_pt(*T8(sum(xs) / len(xs), sum(ys) / len(ys))))
# кластеры выводов (синий+красный рядом = одна точка)
clusters = []
for p in pts:
    for c in clusters:
        if math.hypot(c['x'] - p[0], c['z'] - p[1]) < 0.35: c['pts'].append(p); c['x'] = sum(q[0] for q in c['pts']) / len(c['pts']); c['z'] = sum(q[1] for q in c['pts']) / len(c['pts']); break
    else: clusters.append({'x': p[0], 'z': p[1], 'pts': [p]})
fixtures = []
for c in clusters:
    best = min(notes, key=lambda nt: math.hypot(nt[1][0] - c['x'], nt[1][1] - c['z']))
    dist = math.hypot(best[1][0] - c['x'], best[1][1] - c['z'])
    if dist > 3.5: continue
    fixtures.append({'t': best[0], 'x': round(c['x'], 2), 'z': round(c['z'], 2)})
for f in fixtures: f['room'] = room_at(f['x'], f['z'])
# поправки типов (подписи «прим.N» стоят колонками в стороне от выводов, ближайшая не всегда та):
for f in fixtures:
    if f['room'] == 10 and f['z'] > 29 and f['x'] < 11: f['t'] = 1          # унитазы мужского с/у
    if abs(f['x'] - 11.29) < .2 and abs(f['z'] - 16.85) < .2: f['t'] = 2     # вторая раковина женской
    if abs(f['x'] - 18.26) < .2 and abs(f['z'] - 15.09) < .2: f['t'] = 5     # пурифайер у стены зала
    if f['t'] == 1 and f['room'] == 8: f['room'] = 7                         # унитазы женской стоят на границе с коридором
    if f['t'] == 3 and f['room'] == 8: f['room'] = 7
print('кластеры выводов (x, z, тип по ближайшей «прим», помещение):')
for f in sorted(fixtures, key=lambda f: (f['room'] or 0, f['x'], f['z'])): print('   ', f)
cnt = collections.Counter(f['t'] for f in fixtures)
print('сантехника:', {NOTE[k]: v for k, v in sorted(cnt.items())}, '(выводов %d, кластеров %d)' % (len(pts), len(clusters)))
print('   по помещениям:', sorted(collections.Counter((f['room'], f['t']) for f in fixtures).items(), key=lambda kv: (kv[0][0] or 0, kv[0][1])))
# пожарные краны «ПК»: подписи листа 4 — либо текст «пк», либо две буквы столбиком (повёрнутая подпись)
hyd = [((t['x'] + t['x1']) / 2, (t['y'] + t['y1']) / 2) for t in P4['texts'] if t['t'].lower() == 'пк']
small = [t for t in P4['texts'] if t['size'] < 3 and t['t'].lower() in ('п', 'к')]
for a in small:
    for b_ in small:
        if a is not b_ and a['t'].lower() == 'п' and b_['t'].lower() == 'к' and abs(a['x'] - b_['x']) < 2 and abs(a['y'] - b_['y']) < 5:
            hyd.append(((a['x'] + b_['x1']) / 2, (a['y'] + b_['y1']) / 2))
hydrants = [{'x': round(X, 2), 'z': round(Z, 2)} for X, Z in (m_of_pt(x, y) for x, y in hyd)]
print('пожарные краны (ПК) по подписям:', hydrants)

# ---------- тренажёры и мебель (лист 61) ----------
P61, T61 = frame(61)
tx = [dict(t, cx=(t['x'] + t['x1']) / 2, cy=(t['y'] + t['y1']) / 2) for t in P61['texts']]
labels = [t for t in tx if re.match(r'^#\d+$', t['t'])]
# повёрнутые подписи (#2, #10) разбиты на отдельные символы «#», «1», «0» столбиком — склеиваем по вертикали
for h in [t for t in tx if t['t'] == '#']:
    digs = sorted([t for t in tx if re.match(r'^\d$', t['t']) and abs(t['x'] - h['x']) < 1.5 and 0 < t['y'] - h['y'] < 7], key=lambda t: t['y'])
    if digs: labels.append(dict(h, t='#' + ''.join(d['t'] for d in digs)))
names = [t for t in tx if 1.6 <= t['size'] <= 3.0 and not t['t'].startswith('#') and re.search(r'[A-Za-z]{3}', t['t']) and len(t['t']) > 3]
legend = collections.defaultdict(collections.Counter)
for lb in labels:
    near = [nm for nm in names if math.hypot(nm['cx'] - lb['cx'], nm['cy'] - lb['cy']) < 22]
    for nm in near: legend[int(lb['t'][1:])][nm['t']] += 1
print('легенда тренажёров (автоподбор по близости, проверить глазами):')
for k in sorted(legend): print('  #%d: %s' % (k, dict(legend[k])))
gym = []
for lb in labels:
    X, Z = m_of_pt(*T61(lb['cx'], lb['cy'])); gym.append({'n': int(lb['t'][1:]), 'x': round(X, 2), 'z': round(Z, 2)})
furn = []
for t in tx:
    m = re.match(r'^(\d+(?:,\d)?)\s+(.+)$', t['t'])
    if m and t['size'] >= 9.5 and t['cx'] > B4[0] - 150 and t['cy'] > 150:
        X, Z = m_of_pt(*T61(t['cx'], t['cy'])); furn.append({'n': m.group(1), 'name': m.group(2), 'x': round(X, 2), 'z': round(Z, 2)})
print('мебель:', [(f['n'], f['name'], f['x'], f['z']) for f in furn])
# номера шкафчиков: пары «a/b» на листе 4
lk = [t for t in P4['texts'] if re.match(r'^\d+/\d+$', t['t'])]
print('подписей шкафчиков на листе 4:', len(lk), 'макс номер', max(int(t['t'].split('/')[1]) for t in lk))

# ---------- подложка: лист 4 в рамке штриховки, ~50 px/м ----------
clip = pymupdf.Rect(B4[0], PH - B4[3], B4[2], PH - B4[1])
dpi = int(72 * 50 * S)                        # 50 px на метр
pix = page.get_pixmap(dpi=dpi, clip=clip, alpha=False)
pl = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
pl = Image.eval(pl, lambda v: int(v * 0.93))
pl.save(os.path.join(OUT, 'club-plan.jpg'), quality=82)
print('подложка', pl.size)

# ---------- контрольная картинка ----------
chk = Image.fromarray(np.where(wmask, 70, 245).astype(np.uint8)).convert('RGB'); cd = ImageDraw.Draw(chk)
for r in rooms:
    if r['poly']: cd.polygon([(x / PXM, z / PXM) for x, z in r['poly']['outer']], outline=(40, 120, 220))
    cd.text((r['x'] / PXM - 10, r['z'] / PXM), '%d' % r['no'], fill=(200, 0, 0))
for c in columns: cd.polygon([(x / PXM, z / PXM) for x, z in c['outer']], fill=(220, 60, 60))
for hd in hydrants: cd.ellipse([hd['x'] / PXM - 8, hd['z'] / PXM - 8, hd['x'] / PXM + 8, hd['z'] / PXM + 8], outline=(255, 0, 0), width=3)
for f in fixtures: cd.ellipse([f['x'] / PXM - 6, f['z'] / PXM - 6, f['x'] / PXM + 6, f['z'] / PXM + 6], fill=(0, 0, 255) if f['t'] != 5 else (0, 180, 0))
for g in gym: cd.text((g['x'] / PXM, g['z'] / PXM), '#%d' % g['n'], fill=(120, 0, 160))
for f in furn: cd.text((f['x'] / PXM, f['z'] / PXM), f['n'], fill=(0, 120, 0))
chk.resize((W // 2, H // 2)).save(os.path.join(SRC, 'check-f0.png'))

json.dump({'levels': [{'id': 'f0', 'name': 'цокольный этаж', 'y0': 0.0, 'h': 3.0, 'bbox': [0, 0, round(WM, 2), round(HM, 2)],
                       'scale': {'mPerPt': round(S, 6), 'origin': [round(B4[0], 1), round(B4[3], 1)]},
                       'walls': wall_shapes, 'columns': columns, 'hydrants': hydrants, 'rooms': rooms,
                       'fixtures': fixtures, 'fixtureTypes': NOTE, 'gym': gym, 'furn': furn}]},
          open(os.path.join(OUT, 'club-geom.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok ->', OUT)
