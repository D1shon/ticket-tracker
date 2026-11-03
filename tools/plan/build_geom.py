"""Собирает club-geom.json и club-plan.jpg из векторных PDF проекта (ВК-план + листы ОВ 5/7).
Система координат модели: X вдоль здания (ось 1 = 0), Z поперёк (ось Е = 0, ось А ≈ 22.5), Y вверх."""
import sys, os, json, math
sys.path.insert(0, r'C:\Users\Sales5\.gemini\antigravity\scratch\ticket-tracker\tools\lidar'); import nprand_shim  # noqa
import numpy as np, cv2
from scipy import ndimage as ndi
from PIL import Image, ImageDraw

OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
XMIN, XMAX, ZMIN, ZMAX, PX = -7.5, 64.0, -0.6, 26.0, 0.02
Wpx, Hpx = int((XMAX - XMIN) / PX), int((ZMAX - ZMIN) / PX)
vk = json.load(open('vk.json', encoding='utf-8'))
ov5 = json.load(open('ov5.json', encoding='utf-8')); ov7 = json.load(open('ov7.json', encoding='utf-8'))

# --- преобразования лист -> метры ---
def T_vk(x, y): return (x - 163.9) * 0.106, (437.4 - y) * 0.106
S_OV = 60.6 / 1726.0
def T_ov5(x, y): return (x - 191) * S_OV - 0.1, (741 - y) * S_OV + 4.39
def T_ov7(x, y): return (x - 137) * S_OV - 0.1, (743 - y) * S_OV + 4.39
def px(X, Z): return (X - XMIN) / PX, (Z - ZMIN) / PX

# --- общий конвейер: маска -> чистка -> полигоны ---
def mask_to_shapes(m, min_area=0.08, close=2, open_=2, simplify_m=0.03):
    m = m.astype(np.uint8)
    if close: m = ndi.binary_closing(m, structure=np.ones((2*close+1, 2*close+1))).astype(np.uint8)
    if open_: m = ndi.binary_opening(m, structure=np.ones((2*open_+1, 2*open_+1))).astype(np.uint8)
    lab, n = ndi.label(m)
    if n:
        areas = ndi.sum(m, lab, index=np.arange(1, n+1)) * PX * PX
        cents = ndi.center_of_mass(m, lab, index=np.arange(1, n+1))
        drop = []
        for i, (a, (cy, cx)) in enumerate(zip(areas, cents)):
            X, Z = cx * PX + XMIN, cy * PX + ZMIN
            # мусор: мелочь вообще; ромбы осей — мелкие фигуры над залом (Z<4.2 при X>0) или правее тамбура
            if a < min_area or (a < 0.3 and ((Z < 4.2 and X > 0.3) or X > 61.6)): drop.append(i + 1)
        m[np.isin(lab, drop)] = 0
    cs, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    shapes = []
    if hier is None: return shapes, m
    hier = hier[0]
    def conv(c):
        c = cv2.approxPolyDP(c, simplify_m / PX, True).reshape(-1, 2)
        return [[round(float(x) * PX + XMIN, 3), round(float(y) * PX + ZMIN, 3)] for x, y in c]
    idx = {}
    for i, (nxt, prv, child, parent) in enumerate(hier):
        if parent == -1 and len(cs[i]) >= 3:
            idx[i] = {'outer': conv(cs[i]), 'holes': []}; shapes.append(idx[i])
    for i, (nxt, prv, child, parent) in enumerate(hier):
        if parent != -1 and parent in idx and len(cs[i]) >= 3:
            idx[parent]['holes'].append(conv(cs[i]))
    return shapes, m

def draw_lines(img, segs, T, width=2, pred=lambda s: True, fill_polys=False):
    dr = ImageDraw.Draw(img)
    for s in segs:
        if not pred(s): continue
        pts = [px(*T(x, y)) for x, y in s['pts']]
        if len(pts) < 2: continue
        if fill_polys and s['f'] and len(pts) >= 3: dr.polygon(pts, fill=255)
        else: dr.line(pts, fill=255, width=width)

# ================= 1. СТЕНЫ (план ВК) =================
xs = np.arange(Wpx) * PX + XMIN; zs = np.arange(Hpx) * PX + ZMIN
# (а) тела стен основного зала: серые заливки (сэндвич-панели, перегородки, колонны) — точные, без мусора
m = Image.new('L', (Wpx, Hpx), 0)
draw_lines(m, vk['segs'], T_vk, 2, lambda s: s['c'] == [0.753,0.753,0.753] and s['f'], fill_polys=True)
solid = np.array(m) > 0
# (б) кирпичные стены с X-штриховкой (чёрная 0.24, короткие диагонали): сомкнуть и оставить только крупные тела
m = Image.new('L', (Wpx, Hpx), 0); dr = ImageDraw.Draw(m)
for s in vk['segs']:
    if s['c'] == [0,0,0] and s['w'] == 0.24:
        pts = [px(*T_vk(x, y)) for x, y in s['pts']]
        for (x0,y0),(x1,y1) in zip(pts, pts[1:]):
            if abs(x1-x0) > 1 and abs(y1-y0) > 1 and math.hypot(x1-x0, y1-y0) < 60: dr.line([(x0,y0),(x1,y1)], fill=255, width=2)
_, hatch = mask_to_shapes(np.array(m) > 0, min_area=0.5, close=8, open_=3)
# (в) пристройка слева и тамбур справа нарисованы двойными толстыми линиями без заливки
m = Image.new('L', (Wpx, Hpx), 0)
draw_lines(m, vk['segs'], T_vk, 3, lambda s: s['c'] == [0,0,0] and s['w'] >= 0.54 and not s['f'])
ext = np.array(m) > 0
ext[:, (xs > 0.3) & (xs < 60.6)] = False
_, ext = mask_to_shapes(ext, min_area=0.3, close=7, open_=1)
wm = solid | (hatch > 0) | (ext > 0)
wm[:, ~((xs > -6.6) & (xs < 63.4))] = False; wm[~((zs > -0.6) & (zs < 25.2)), :] = False
walls, wmask = mask_to_shapes(wm, min_area=0.08, close=1, open_=1, simplify_m=0.04)
print('стены: %d фигур, %d дырок' % (len(walls), sum(len(w['holes']) for w in walls)))

# ================= 2. ВОЗДУХОВОДЫ (ОВ лист 7, чёрные 1.08) =================
m = Image.new('L', (Wpx, Hpx), 0)
draw_lines(m, ov7['segs'], T_ov7, 2, lambda s: s['c'] == [0,0,0] and s['w'] == 1.08 and not s['f'])
dm = np.array(m) > 0
dm[:, ~((xs > -0.5) & (xs < 61))] = False; dm[~((zs > 4.0) & (zs < 23.5)), :] = False   # только основной зал
ducts, dmask = mask_to_shapes(dm, min_area=0.15, close=10, open_=3, simplify_m=0.05)
print('воздуховоды: %d фигур' % len(ducts))

# --- подписи воздуховодов: по меткам листа 7 (ВД1–4, КПД4-03) и по помещению ---
SMOKE = {'ВД1': (35.1, 7.2), 'ВД2': (54.3, 8.5), 'ВД3': (48.5, 17.4), 'ВД4': (25.0, 17.8)}      # «Ø800 L35000 к ВДn»
KPD = [(31.0, 7.7), (48.2, 8.4), (20.9, 18.3), (44.5, 18.0)]                                      # КПД4-03 700×700 EI45
ROOMS = [('женская раздевалка и душевые', 0, 11, 4.4, 16.3), ('мужская раздевалка и душевые', 11, 24.5, 4.4, 9.3),
         ('с/у', 11, 18, 9.3, 13.2), ('холл и ресепшн', 0, 11, 16.3, 22.8), ('тепловой пункт', 48, 54.3, 4.4, 7.2),
         ('холодстанция', 54.3, 61, 4.4, 7.2), ('FT zone', 24, 42, 4.4, 13.6), ('Legs zone', 42, 61, 7.2, 13.6),
         ('коридор', 11, 61, 13.6, 15.6), ('Bootcamp zone', 11, 36, 15.6, 22.8), ('Upper/FFB zone', 36, 61, 15.6, 22.8)]
def room_of(x, z):
    for n, x0, x1, z0, z1 in ROOMS:
        if x0 <= x < x1 and z0 <= z < z1: return n
    return 'зал'
def ring_area(r):
    return 0.5 * abs(sum(r[i][0] * r[(i+1) % len(r)][1] - r[(i+1) % len(r)][0] * r[i][1] for i in range(len(r))))
# каждой системе ВДn — одна точка: ближайшая мелкая фигура к середине между подписью «к ВДn» и парным клапаном КПД
SMOKE_KPD = {'ВД1': KPD[0], 'ВД2': KPD[1], 'ВД3': KPD[3], 'ВД4': KPD[2]}
centers = [(np.array(d['outer']).mean(0), np.ptp(np.array(d['outer']), axis=0).max()) for d in ducts]
smoke_of = {}
for sm, (sx, sz) in SMOKE.items():
    kx, kz = SMOKE_KPD[sm]; mx, mz = (sx + kx) / 2, (sz + kz) / 2
    cand = [(math.hypot(c[0] - mx, c[1] - mz), i) for i, (c, L) in enumerate(centers) if L < 2.5]
    if cand and min(cand)[0] < 3.5: smoke_of[min(cand)[1]] = sm
for di, dct in enumerate(ducts):
    P = np.array(dct['outer']); x0, z0 = P.min(0); x1, z1 = P.max(0); cx, cz = P.mean(0)
    L = max(x1 - x0, z1 - z0); A = ring_area(dct['outer']) - sum(ring_area(h) for h in dct['holes'])
    wid = A / L if L > 0 else 0
    room = room_of(cx, cz)
    rooms = []
    for px_, pz_ in list(dct['outer'][::max(1, len(dct['outer']) // 12)]) + [(cx, cz)]:
        r = room_of(px_, pz_)
        if r not in rooms: rooms.append(r)
    if len(rooms) > 1 and 'зал' in rooms: rooms.remove('зал')
    if di in smoke_of:
        sm = smoke_of[di]
        dct['info'] = {'name': 'Дымоудаление %s: клапан КПД4-03 и выход Ø800 на крышу' % sm,
                       'loc': '%s, под потолком; вертикальный короб Ø800 к крышному вентилятору %s' % (room, sm),
                       'desc': 'Точка системы дымоудаления %s (лист 7 проекта ОВ): нормально закрытый противопожарный клапан КПД4-03 700×700 (EI45) и круглый воздуховод Ø800 вверх, на крышный вентилятор. Расход 35 000 м³/ч. В обычном режиме не работает — включается автоматикой пожарной сигнализации.' % sm,
                       'off': 'Вручную не открывать и не закрывать. Это путь удаления дыма при пожаре: неисправный клапан или вентилятор — заявка в HJ Track с пометкой «пожарная безопасность».',
                       'steps': ['При пожаре ничего не трогать — система запускается сама от сигнализации.', 'Если после тревоги нет шума вентилятора на крыше — сообщить менеджеру, в заявке указать номер системы %s.' % sm, 'Проверка клапанов — только обслуживающей организацией по графику.'],
                       'warn': 'Не загораживать клапан инвентарём и не закрывать его подвесным потолком без лючка.'}
    elif L < 1.6:
        dct['info'] = {'name': 'Диффузор / решётка вентиляции', 'loc': room + ', потолок',
                       'desc': 'Точка раздачи или забора воздуха общеобменной вентиляции (лист 7 проекта ОВ): потолочный диффузор или решётка на ответвлении от магистрали.',
                       'off': 'Закрытая или заклеенная решётка нарушает баланс воздуха в помещении — духота или сквозняк у соседей.',
                       'steps': ['Если дует слишком сильно/слабо — не регулировать самостоятельно, заявка на наладку.', 'Пыль на решётке — в заявку на уборку.'],
                       'warn': 'Не закрывать и не заклеивать.'}
    else:
        dct['info'] = {'name': 'Воздуховод общеобменной вентиляции — %s' % ', '.join(rooms),
                       'loc': '%s; под потолком, длина %.0f м, ширина ≈ %.0f см' % (', '.join(rooms), L, wid * 100),
                       'desc': 'Магистраль/ответвление общеобменной вентиляции по листу 7 проекта ОВ (приток от ПВ1/П2 на антресоли пристройки, вытяжка В1–В3). Номер конкретной системы на плане подписан мелким шрифтом в виде контуров и в PDF не читается — уточняется по исполнительной документации.',
                       'off': 'Перекрыть воздуховод нельзя — только выключить установку на антресоли (ПВ1/П2) или вытяжной вентилятор.',
                       'steps': ['Шум, свист, капли или запах из воздуховода — заявка в HJ Track с указанием помещения.', 'Не ставить оборудование вплотную к открытым решёткам.'],
                       'warn': 'Воздуховод не рассчитан на нагрузку: не вешать на него ничего и не опираться.'}

# ================= 3. ТРУБЫ ОТОПЛЕНИЯ (ОВ лист 5, чёрные 1.08) =================
def polylines(segs, T, pred, min_len=0.3):
    out = []
    for s in segs:
        if not pred(s): continue
        pts = [T(x, y) for x, y in s['pts']]
        L = sum(math.hypot(x1-x0, z1-z0) for (x0,z0),(x1,z1) in zip(pts, pts[1:]))
        if L >= min_len: out.append([[round(x, 3), round(z, 3)] for x, z in pts])
    return out
heat = polylines(ov5['segs'], T_ov5, lambda s: s['c'] == [0,0,0] and s['w'] == 1.08 and not s['f'])
heat = [p for p in heat if all(-0.5 < x < 61 and 4.0 < z < 23.5 for x, z in p)]
print('трубы отопления: %d полилиний, %.0f м' % (len(heat), sum(math.hypot(b[0]-a[0], b[1]-a[1]) for p in heat for a, b in zip(p, p[1:]))))

# ================= 4. ТРУБЫ ВК: Т3 (красные заливки), Т4 (маджента) =================
def fill_segments(segs, color, T, min_aspect=4, min_len=0.25):
    out = []
    for s in segs:
        if s['c'] != color or not s['f'] or len(s['pts']) < 4: continue
        P = np.array([T(x, y) for x, y in s['pts']])
        c = P.mean(0); Q = P - c
        u, sv, vt = np.linalg.svd(Q, full_matrices=False)
        if sv[1] < 1e-9 or sv[0] / sv[1] < min_aspect: continue
        d = vt[0]; t = Q @ d
        if t.max() - t.min() < min_len: continue
        a, b = c + d * t.min(), c + d * t.max()
        out.append([[round(float(a[0]), 3), round(float(a[1]), 3)], [round(float(b[0]), 3), round(float(b[1]), 3)]])
    return out
inb = lambda p: all(-7 < x < 62 and 2.5 < z < 24 for x, z in p)
t3 = [p for p in fill_segments(vk['segs'], [1.0,0.0,0.0], T_vk) if inb(p)]
t4 = [p for p in fill_segments(vk['segs'], [1.0,0.0,0.749], T_vk) if inb(p)]
t4 += [p for p in polylines(vk['segs'], T_vk, lambda s: s['c'] == [1.0,0.0,0.749] and s['w'] >= 0.72 and not s['f']) if inb(p)]
print('Т3: %d отрезков, Т4: %d' % (len(t3), len(t4)))

# ================= 5. ПОДЛОЖКА-ЧЕРТЁЖ =================
im = Image.new('RGB', (Wpx, Hpx), (247, 248, 250)); dr = ImageDraw.Draw(im)
def rgbc(c): return tuple(int(255*v) for v in c) if isinstance(c, list) and len(c) == 3 else (0,0,0)
for s in vk['segs']:
    c = s['c'] or [0,0,0]
    if c in ([1.0,1.0,1.0], [0.957,0.976,0.992]): continue
    col = rgbc(c)
    if col == (0,0,0): col = (70, 80, 95) if s['w'] >= 0.54 else (150, 158, 170)
    elif col == (192,192,192): col = (205, 210, 218)
    elif col == (47,47,47): col = (120, 128, 140)
    pts = [px(*T_vk(x, y)) for x, y in s['pts']]
    if len(pts) < 2: continue
    if s['f'] and len(pts) >= 3 and col not in ((150,158,170),): dr.polygon(pts, fill=col)
    else: dr.line(pts, fill=col, width=max(1, int(s['w'] * 0.106 / PX)))
# стены залить тёмным по маске; схемы узлов над залом (вне здания) — стереть
arr = np.array(im); arr[wmask > 0] = (52, 60, 75)
zz, xx = np.mgrid[0:Hpx, 0:Wpx]; Xg, Zg = xx * PX + XMIN, zz * PX + ZMIN
arr[(Zg < 4.1) & (Xg > 0.4)] = (247, 248, 250)
im = Image.fromarray(arr)
im.save(os.path.join(OUT, 'club-plan.jpg'), quality=82)
print('подложка %dx%d' % im.size)

json.dump({'bbox': [XMIN, ZMIN, XMAX, ZMAX], 'walls': walls, 'ducts': ducts, 'heat': heat, 't3': t3, 't4': t4},
          open(os.path.join(OUT, 'club-geom.json'), 'w'), separators=(',', ':'))
print('club-geom.json %.0f КБ' % (os.path.getsize(os.path.join(OUT, 'club-geom.json')) / 1024))

# контрольные картинки
chk = Image.new('RGB', (Wpx, Hpx), (255,255,255)); dr = ImageDraw.Draw(chk)
for w in walls:
    dr.polygon([px(x, z) for x, z in w['outer']], fill=(60,70,90))
    for h in w['holes']: dr.polygon([px(x, z) for x, z in h], fill=(255,255,255))
for d in ducts:
    dr.polygon([px(x, z) for x, z in d['outer']], fill=(80,200,120))
for p in heat: dr.line([px(x, z) for x, z in p], fill=(230,60,60), width=3)
for p in t3: dr.line([px(x, z) for x, z in p], fill=(255,120,0), width=4)
for p in t4: dr.line([px(x, z) for x, z in p], fill=(200,0,160), width=4)
chk.thumbnail((2000, 2000)); chk.save('geom_check.png')
