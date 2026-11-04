"""build_geom_4you.py <dir с p3..p10.json> <out dir>
Геометрия клуба 4YOU (ЖК «4you», Алматы) из рабочего проекта ОВ 896-24-ОВ (ТОО ___, 2025, 15 листов, dump.py).
Клуб на трёх уровнях: зал −2 этажа 40.9×23.6 м (оси 1–6 × Д–А), над его западной третью 1-й и 2-й этажи
(оси 1–3 × Д–А, 16.8×23.6). Листы: 3/4/5 — отопление −2/1/2; 6/7/8 — вентиляция −2/1/2; 9/10 — кондиционирование −2/1.
Система координат модели: X вдоль осей 1→6 (ось 1 = 0), Z от оси Д (0) к оси А (23.6), Y вверх; отметки:
−2 этаж = 0, 1-й = 7.56, 2-й = 12.06, кровля = 16.91 (по проектным −7.560 / 0.000 / +4.500 / +9.350).
"""
import sys, os, json, math, collections
import numpy as np
from scipy import ndimage as ndi
import cv2
from PIL import Image, ImageDraw

SRC = sys.argv[1]; OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)
S = 8.4 / 238.0                      # м / pt (пролёт 8400 мм = 238 pt на обоих форматах)
# A2 (листы 3, 6, 9): ось 1 x=294, ось Д y=995 ; A3 (листы 4, 5, 7, 8, 10): ось 1 x=193, ось Д y=919.9
TA2 = lambda x, y: ((x - 294) * S, (995 - y) * S)
TA3 = lambda x, y: ((x - 193) * S, (919.9 - y) * S)
PX = 0.025                            # м/пиксель растровых масок

LEVELS = [
  dict(id='m2', name='−2 этаж', y0=0.0,   h=3.95, heat=3, vent=6, cond=9,  T=TA2, box=(-4.6, -2.2, 42.5, 25.2)),
  dict(id='f1', name='1 этаж',  y0=7.56,  h=4.2,  heat=4, vent=7, cond=10, T=TA3, box=(-1.2, -1.2, 18.2, 25.0)),
  dict(id='f2', name='2 этаж',  y0=12.06, h=4.6,  heat=5, vent=8, cond=None, T=TA3, box=(-1.2, -1.2, 18.2, 25.0)),
]

def load(p): return json.load(open(os.path.join(SRC, 'p%d.json' % p), encoding='utf-8'))
def col(s): return tuple(round(v, 2) for v in s['c']) if s['c'] else None

def mask_to_shapes(m, min_area=0.08, close=2, open_=2, simplify_m=0.03, x0=0, z0=0):
    """бинарная маска -> [{'outer':[[x,z]..],'holes':[[..]]}] в метрах"""
    m = m.astype(bool)
    if close: m = ndi.binary_closing(m, structure=np.ones((3, 3)), iterations=close)
    if open_: m = ndi.binary_opening(m, structure=np.ones((3, 3)), iterations=open_)
    m = ndi.binary_fill_holes(m) if False else m
    lab, n = ndi.label(m)
    sizes = ndi.sum(m, lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s * PX * PX >= min_area])
    cnts, hier = cv2.findContours(keep.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    shapes = []
    if hier is None: return shapes, keep
    hier = hier[0]
    eps = simplify_m / PX
    def ring(c):
        c = cv2.approxPolyDP(c, eps, True).reshape(-1, 2)
        return [[round(float(px) * PX + x0, 3), round(float(pz) * PX + z0, 3)] for px, pz in c]
    for i, c in enumerate(cnts):
        if hier[i][3] != -1: continue
        r = ring(c)
        if len(r) < 3: continue
        holes = []
        j = hier[i][2]
        while j != -1:
            h = ring(cnts[j])
            if len(h) >= 3 and cv2.contourArea(cnts[j]) * PX * PX > 0.02: holes.append(h)
            j = hier[j][0]
        shapes.append({'outer': r, 'holes': holes})
    return shapes, keep

class Raster:
    def __init__(self, box):
        self.x0, self.z0, self.x1, self.z1 = box
        self.W = int((self.x1 - self.x0) / PX) + 1; self.H = int((self.z1 - self.z0) / PX) + 1
        self.im = Image.new('L', (self.W, self.H), 0); self.dr = ImageDraw.Draw(self.im)
    def px(self, x, z): return ((x - self.x0) / PX, (z - self.z0) / PX)
    def line(self, pts, w=1):
        self.dr.line([self.px(*p) for p in pts], fill=255, width=max(1, int(w)))
    def poly(self, pts):
        if len(pts) > 2: self.dr.polygon([self.px(*p) for p in pts], fill=255)
    def mask(self): return np.array(self.im) > 0

def seglen(pts): return sum(math.hypot(b[0]-a[0], b[1]-a[1]) for a, b in zip(pts, pts[1:]))

def polylines(d, T, pred, min_len=0.25):
    out = []
    for s in d['segs']:
        if s['f'] or not pred(s): continue
        pts = [T(x, y) for x, y in s['pts']]
        if seglen(pts) < min_len: continue
        out.append([[round(x, 3), round(z, 3)] for x, z in pts])
    return out

# ---------------- справочники ----------------
FC_MODELS = {  # модель внутреннего блока Gree GMV -> (холод кВт, расход м³/ч)
  'GMV-ND18T/E-T': (1.8, 460), 'GMV-ND28T/E-T': (2.8, 570), 'GMV-ND36T/E-T': (3.6, 620),
  'GMV-ND45T/C-T': (4.5, 800), 'GMV-ND71T/C-T': (7.1, 1150), 'GMV-ND28T/B-T': (2.8, 570),
}
# −2 этаж (лист 9): центры красных кружков символов + модель, прочитанная с чертежа
FC_M2 = [
  ((393, 906), 'GMV-ND18T/E-T'), ((587, 906), 'GMV-ND18T/E-T'), ((784, 906), 'GMV-ND18T/E-T'),
  ((970, 910), 'GMV-ND71T/C-T'), ((1161, 912), 'GMV-ND71T/C-T'), ((1349, 910), 'GMV-ND71T/C-T'),
  ((393, 792), 'GMV-ND18T/E-T'), ((590, 803), 'GMV-ND18T/E-T'),
  ((1088, 728), 'GMV-ND28T/E-T'), ((1226, 729), 'GMV-ND28T/E-T'), ((1374, 725), 'GMV-ND28T/E-T'),
  ((895, 681), 'GMV-ND28T/E-T'),
  ((367, 622), 'GMV-ND28T/E-T'), ((502, 618), 'GMV-ND28T/E-T'),
  ((906, 555), 'GMV-ND28T/E-T'), ((1090, 554), 'GMV-ND28T/E-T'), ((1230, 554), 'GMV-ND28T/E-T'), ((1374, 552), 'GMV-ND28T/E-T'),
  ((378, 427), 'GMV-ND28T/E-T'), ((507, 423), 'GMV-ND28T/E-T'),
  ((858, 391), 'GMV-ND36T/E-T'), ((988, 391), 'GMV-ND36T/E-T'),
]
FC_F1 = [
  ((315, 894), 'GMV-ND45T/C-T'), ((424, 904), 'GMV-ND45T/C-T'), ((345, 720), 'GMV-ND45T/C-T'),
  ((309, 545), 'GMV-ND28T/B-T'), ((323, 426), 'GMV-ND28T/B-T'),
  ((422, 392), 'GMV-ND45T/C-T'), ((579, 392), 'GMV-ND45T/C-T'),
]
ROOMS = {  # (имя, x0, x1, z0, z1) по планировочным решениям альбома (листы 2–4) и экспликации
  'm2': [('Pilates', 0, 12.6, 0, 6.0), ('Fitness test', 12.6, 16.8, 0, 6.0), ('Bootcamp', 16.8, 40.9, 0, 6.0),
         ('Hall', 12.6, 16.8, 6.0, 12.6), ('Metcon', 16.8, 25.2, 6.0, 18.6), ('Upper', 25.2, 40.9, 6.0, 18.6),
         ('Leg zone', 0, 12.6, 6.0, 23.6), ('лестница и лифт', 12.6, 16.8, 12.6, 23.6), ('тех. помещения', 25.2, 40.9, 18.6, 23.6),
         ('Upper', 16.8, 25.2, 18.6, 23.6)],
  'f1': [('кафе', 0, 8.4, 0, 12.6), ('бар и staff', 8.4, 16.8, 0, 12.6), ('переговорная и коридор', 0, 8.4, 12.6, 18.6),
         ('лифтовой холл', 8.4, 16.8, 12.6, 18.6), ('холл и ресепшн', 0, 8.4, 18.6, 23.6), ('холл', 8.4, 16.8, 18.6, 23.6)],
  'f2': [('мужская раздевалка', 8.4, 16.8, 0, 6.0), ('душевые и с/у (мужские)', 0, 8.4, 0, 6.0),
         ('душевые и с/у (женские)', 0, 8.4, 6.0, 12.6), ('комната тренеров и холл', 8.4, 16.8, 6.0, 12.6),
         ('женская раздевалка', 0, 8.4, 12.6, 23.6), ('лестница и лифт', 8.4, 16.8, 12.6, 18.6), ('женская раздевалка', 8.4, 16.8, 18.6, 23.6)],
}
def room_of(lv, x, z):
    for n, x0, x1, z0, z1 in ROOMS[lv]:
        if x0 <= x < x1 and z0 <= z < z1: return n
    return 'зал'

VENT_INFO = {
 'supply': dict(name='ПРИТОК', desc='Приточный воздуховод от установки %s (проект ОВ 896-24-ОВ): свежий воздух с улицы подогревается/охлаждается в установке на кровле и раздаётся через решётки РПР 200×100 и диффузоры. ',
                off='Перекрыть воздуховод нельзя — только остановить приточную установку со щита автоматики.'),
 'exhaust': dict(name='ВЫТЯЖКА', desc='Вытяжной воздуховод к установке %s: забирает отработанный воздух через решётки РВР и уводит на кровлю. ',
                 off='Перекрыть нельзя — только остановить вытяжной вентилятор со щита.'),
}
def duct_info(kind, lv, x, z, L, wid):
    unit = {'m2': ('ПВ1 (16 100 м³/ч)', 'ПВ1'), 'f1': ('ПВ1 (16 100 м³/ч)', 'ПВ1'), 'f2': ('П2 (2 050 м³/ч)', 'В2 (2 050 м³/ч)')}[lv]
    u = unit[0] if kind == 'supply' else unit[1]
    base = VENT_INFO[kind]
    return {'name': '%s — %s, %s' % (base['name'], u, room_of(lv, x, z)),
            'loc': '%s, %s; под потолком, длина %.0f м, ширина ≈ %.0f см' % (LEVEL_NAME[lv], room_of(lv, x, z), L, wid * 100),
            'desc': base['desc'] % u + 'Приток — красный на чертеже, вытяжка — синий. Установки стоят на кровле двухэтажного блока (отм. +9.350), стояки идут вдоль западной стены (воздухозаборная шахта).',
            'off': base['off'],
            'steps': ['Шум, свист, капли конденсата или запах из воздуховода — заявка в HJ Track с указанием зала и места.',
                      'Если в одном зале не дует ни из одной решётки — заслонка или установка: заявка «вентиляция, %s».' % room_of(lv, x, z)],
            'warn': 'Воздуховод не рассчитан на нагрузку: ничего не вешать, не опираться стремянкой.'}
LEVEL_NAME = {l['id']: l['name'] for l in LEVELS}

geom = {'levels': []}
for lv in LEVELS:
    T = lv['T']; box = lv['box']; L = {'id': lv['id'], 'name': lv['name'], 'y0': lv['y0'], 'h': lv['h'], 'bbox': list(box)}
    heat = load(lv['heat']); vent = load(lv['vent']); cond = load(lv['cond']) if lv['cond'] else None
    inside = lambda pts: all(box[0] - 1 <= x <= box[2] + 1 and box[1] - 1 <= z <= box[3] + 1 for x, z in pts)

    # --- стены: серые заливки (1/2 этажи) + серые линии 0.72 (−2) + чёрные толстые линии (ядро лестницы/лифта) + штриховка ---
    R = Raster(box)
    for s in heat['segs']:
        c = col(s); pts = [T(x, y) for x, y in s['pts']]
        if not inside(pts): continue
        if s['f'] and c in ((0.39, 0.39, 0.4), (0, 0, 0), None) and 0.03 < abs(cv2.contourArea(np.array([R.px(*p) for p in pts], np.float32))) * PX * PX < 40:
            R.poly(pts)
        elif (not s['f']) and c == (0.39, 0.39, 0.4) and s['w'] >= 0.6: R.line(pts, 4)   # двойные серые линии перегородок (−2), зазор до 0.2 м закрывается
        elif (not s['f']) and c == (0, 0, 0) and s['w'] >= 1.0: R.line(pts, 3)
        elif (not s['f']) and c == (0, 0, 0) and 0.2 <= s['w'] <= 0.3: R.line(pts, 2)   # штриховка стен; серые 0.24 — штриховка шахты/галереи и размерные, их НЕ брать   # штриховка + двойные линии перегородок (−2); одиночные выноски убирает opening
    walls, wmask = mask_to_shapes(R.mask(), min_area=0.06, close=4, open_=1, simplify_m=0.04, x0=box[0], z0=box[1])
    # ромбы/кружки осей и мелочь за пределами здания убираем по площади+положению: оставляем всё внутри коробки здания
    L['walls'] = walls
    print('%s: стены %d' % (lv['id'], len(walls)))

    # --- воздуховоды: красные = приток, синие = вытяжка ---
    L['ducts'] = []
    for kind, test in (('supply', lambda c: c and c[0] >= 0.9 and c[1] <= 0.3 and c[2] <= 0.1),
                       ('exhaust', lambda c: c and c[0] <= 0.1 and c[1] <= 0.3 and c[2] >= 0.9)):
        # Воздуховоды на листах нарисованы контуром (толстые линии 0.84/1.08 pt — стенки короба,
        # тонкие 0.24 — пунктир внутри, выноски, рамки подписей). Берём только толстые линии,
        # замыкаем мелкие разрывы и заливаем всё, что не достижимо снаружи, — получаем сплошные
        # короба как в чертеже (04.11.2026, «проплешины» прежнего способа ушли). Замкнутые петли
        # магистралей вокруг помещений заливать нельзя — выбрасываем залитые области шире 0.9 м.
        Rd = Raster(box)
        for s in vent['segs']:
            c = col(s)
            if s['f'] or not test(c) or s['w'] < 0.8: continue
            pts = [T(x, y) for x, y in s['pts']]
            if not inside(pts): continue
            Rd.line(pts, 2)
        m = (Rd.mask()).astype(np.uint8) * 255
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8), iterations=2)
        ff = m.copy(); cv2.floodFill(ff, np.zeros((m.shape[0] + 2, m.shape[1] + 2), np.uint8), (0, 0), 128)
        inner = (ff == 0).astype(np.uint8)                        # внутренности контуров (стенки — барьеры)
        n, lab, _, _ = cv2.connectedComponentsWithStats(inner, 8)
        dist = cv2.distanceTransform(inner, cv2.DIST_L2, 5) * PX
        keep = np.zeros_like(inner); room = np.zeros_like(inner)
        for i in range(1, n):
            comp = lab == i
            if dist[comp].max() <= 0.45: keep[comp] = 1         # короб: полуширина ≤ 0.45 м
            else: room[comp] = 1                                 # шире — помещение внутри петли магистралей
        # стенки, обращённые в помещение, не нужны; остальные толстые линии — это узкие ответвления
        # (250×150, 300×200), нарисованные двумя линиями без замыкания торцов: смыкаем их в полосу
        lines = ((m > 0) & (cv2.dilate(room, np.ones((5, 5), np.uint8)) == 0)).astype(np.uint8)
        narrow = cv2.morphologyEx(lines, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8), iterations=6)
        filled = ((keep > 0) | (narrow > 0)).astype(np.uint8)
        shp, _ = mask_to_shapes(filled, min_area=0.05, close=1, open_=0, simplify_m=0.05, x0=box[0], z0=box[1])
        for sh in shp:
            P = np.array(sh['outer']); ext = np.ptp(P, axis=0); Ls = ext.max(); wid = min(ext.min(), 0.8)
            cx, cz = P.mean(0)
            if Ls < 1.0:
                sh['info'] = {'name': ('Приточная решётка РПР / диффузор' if kind == 'supply' else 'Вытяжная решётка РВР'),
                              'loc': '%s, %s, потолок' % (LEVEL_NAME[lv['id']], room_of(lv['id'], cx, cz)),
                              'desc': 'Точка раздачи (приток) или забора (вытяжка) воздуха на ответвлении от магистрали (проект ОВ 896-24-ОВ, решётки 200×100, 95–120 м³/ч).',
                              'off': 'Закрытая или заклеенная решётка нарушает баланс воздуха в помещении.',
                              'steps': ['Не регулировать самостоятельно; пыль — в заявку на уборку; свист — заявка на наладку.'], 'warn': 'Не закрывать и не заклеивать.'}
            else:
                sh['info'] = duct_info(kind, lv['id'], cx, cz, Ls, wid)
            sh['kind'] = kind
            L['ducts'].append(sh)
    print('   воздуховоды %d' % len(L['ducts']))

    # --- трубы отопления (синие/красные толстые линии) ---
    L['heat'] = polylines(heat, T, lambda s: col(s) in ((0, 0, 1), (1, 0, 0)) and s['w'] >= 0.8 and inside([T(x, y) for x, y in s['pts']]))
    # --- фреонопроводы VRF (зелёные) ---
    L['cold'] = polylines(cond, T, lambda s: col(s) == (0, 1, 0) and inside([T(x, y) for x, y in s['pts']])) if cond else []
    print('   трубы отопления %d, фреон %d' % (len(L['heat']), len(L['cold'])))

    # --- фанкойлы (внутренние блоки VRF) ---
    L['fancoils'] = []
    src = FC_M2 if lv['id'] == 'm2' else FC_F1 if lv['id'] == 'f1' else []
    for i, ((px_, py_), model) in enumerate(src):
        x, z = T(px_, py_); q, flow = FC_MODELS[model]; room = room_of(lv['id'], x, z)
        L['fancoils'].append({'x': round(x, 2), 'z': round(z, 2), 'y': round(lv['y0'] + lv['h'] - 0.35, 2), 'model': model, 'q': q, 'room': room,
            'info': {'name': 'Внутренний блок VRF №%d %s — %s' % (i + 1, model.split('/')[0], room),
                     'loc': '%s, %s, над подвесным потолком' % (LEVEL_NAME[lv['id']], room),
                     'desc': 'Канальный внутренний блок системы Gree GMV (VRF): холод %.1f кВт, расход воздуха %d м³/ч. Работает на охлаждение и обогрев от наружного блока %s на кровле; дренаж конденсата — в канализацию.' % (q, flow, 'GMV-615WM (61.5 кВт, −2 этаж)' if lv['id'] == 'm2' else 'GMV-280WM (28 кВт, 1 этаж)'),
                     'off': 'Выключается со своего пульта: только его зона станет теплее/холоднее, остальные блоки работают.',
                     'steps': ['Не дует/не холодит — проверь пульт (режим, температура, ошибка на дисплее), фото кода ошибки в заявку.',
                               'Капает с потолка под блоком — засор дренажа: подставь ёмкость, заявка «кондиционирование, %s».' % room,
                               'Фильтры блока чистит сервис по графику; шум при работе — заявка.'],
                     'warn': 'Над потолком — фреон под давлением и 220 В. Самому не вскрывать.'}})
    print('   фанкойлы %d' % len(L['fancoils']))

    # --- подложка: лист отопления в цветах, стены по маске ---
    W, H = R.W, R.H
    im = Image.new('RGB', (W, H), (247, 248, 250)); dr = ImageDraw.Draw(im)
    for s in heat['segs']:
        c = col(s); pts = [R.px(*T(x, y)) for x, y in s['pts']]
        if not all(0 <= px < W and 0 <= pz < H for px, pz in pts): continue
        if c is None: continue
        cc = tuple(int(v * 255) for v in c)
        if c == (1, 1, 1): continue
        if s['f']:
            if len(pts) > 2: dr.polygon(pts, fill=cc)
        else: dr.line(pts, fill=cc, width=max(1, int(s['w'] * 0.35 / 0.025 / 10)))
    arr = np.array(im); arr[wmask] = (52, 60, 75)
    Image.fromarray(arr).save(os.path.join(OUT, 'plan-%s.jpg' % lv['id']), quality=82)
    print('   подложка %dx%d' % (W, H))
    geom['levels'].append(L)

json.dump(geom, open(os.path.join(OUT, 'club-geom.json'), 'w'), separators=(',', ':'))
print('club-geom.json %.0f КБ' % (os.path.getsize(os.path.join(OUT, 'club-geom.json')) / 1024))

# контрольные картинки по уровням
for L in geom['levels']:
    x0, z0, x1, z1 = L['bbox']; W = int((x1 - x0) / PX) + 1; H = int((z1 - z0) / PX) + 1
    chk = Image.new('RGB', (W, H), (255, 255, 255)); dr = ImageDraw.Draw(chk)
    px = lambda x, z: ((x - x0) / PX, (z - z0) / PX)
    for w in L['walls']:
        dr.polygon([px(*p) for p in w['outer']], fill=(60, 70, 90))
        for h in w['holes']: dr.polygon([px(*p) for p in h], fill=(255, 255, 255))
    for d in L['ducts']: dr.polygon([px(*p) for p in d['outer']], fill=(80, 200, 120) if d['kind'] == 'supply' else (60, 200, 220))
    for p in L['heat']: dr.line([px(*q) for q in p], fill=(230, 60, 60), width=2)
    for p in L['cold']: dr.line([px(*q) for q in p], fill=(40, 160, 40), width=2)
    for f in L['fancoils']: dr.rectangle([px(f['x'] - .4, f['z'] - .4), px(f['x'] + .4, f['z'] + .4)], outline=(0, 0, 255), width=3)
    chk.save(os.path.join(SRC, 'check-%s.png' % L['id']))
print('ok')
