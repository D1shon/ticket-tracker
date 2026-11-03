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
# трассы по листу 7 (прочитаны с увеличенных фрагментов чертежа): kind = supply (SAD-диффузоры, от ПВ1) / exhaust (к ПВ1) / exhaust_fans (к В1–В3)
RUNS = [
  dict(name='северная приточная магистраль FT/Legs (Ø200→Ø400, диффузоры SAD300×300)', x0=24, x1=61, z0=5.0, z1=6.1, kind='supply'),
  dict(name='южная приточная магистраль FT/Legs (Ø200→Ø400, SAD300×300)', x0=24, x1=61, z0=11.8, z1=12.9, kind='supply'),
  dict(name='вытяжная магистраль вдоль коридора (Ø200→Ø400, щелевые решётки CHB1245×68)', x0=11, x1=61, z0=13.6, z1=14.5, kind='exhaust'),
  dict(name='северная приточная магистраль Bootcamp/Upper (Ø315→Ø630, SAD300×300)', x0=11, x1=61, z0=15.3, z1=16.3, kind='supply'),
  dict(name='южная приточная магистраль Bootcamp/Upper (Ø315→Ø630, SAD300×300)', x0=11, x1=61, z0=21.0, z1=22.0, kind='supply'),
  dict(name='стояки 1200×500 от установки ПВ1 в восточной венткамере', x0=58, x1=61.5, z0=4.4, z1=22.8, kind='supply'),
  dict(name='приточная ветка Ø630 в раздевалки и холл (SAD300×300)', x0=0, x1=24, z0=9.3, z1=22.8, kind='supply'),
  dict(name='вытяжка из душевых, с/у и раздевалок (решётки RAG150×150, короба 300×200/400×200 к В1, В2, В3)', x0=0, x1=24, z0=4.4, z1=9.3, kind='exhaust_fans'),
  dict(name='вытяжка из с/у (RAG150×150 к В1/В2)', x0=11, x1=18, z0=9.3, z1=13.2, kind='exhaust_fans'),
]
_, dmask = mask_to_shapes(dm, min_area=0.15, close=10, open_=3, simplify_m=0.05)
# режем очищенную маску по коробкам трасс: каждая фигура получает одну трассу (приток/вытяжка) и свой цвет
ducts = []; used = np.zeros_like(dmask, dtype=bool)
for run in RUNS:
    box = np.zeros_like(dmask, dtype=bool)
    box[((zs >= run['z0']) & (zs <= run['z1']))[:, None] & ((xs >= run['x0']) & (xs <= run['x1']))[None, :]] = True
    sub = (dmask > 0) & box & ~used
    shp, _ = mask_to_shapes(sub, min_area=0.03, close=0, open_=0, simplify_m=0.05)
    for sh in shp: sh['run'] = run; sh['kind'] = run['kind']
    ducts += shp; used |= sub
rest, _ = mask_to_shapes((dmask > 0) & ~used, min_area=0.03, close=0, open_=0, simplify_m=0.05)
for sh in rest: sh['run'] = None; sh['kind'] = 'other'
ducts += rest
print('воздуховоды: %d фигур (по трассам %d, прочие %d)' % (len(ducts), len(ducts) - len(rest), len(rest)))

# --- подписи воздуховодов: по меткам листа 7 (ВД1–4, КПД4-03) и по помещению ---
SMOKE = {'ВД1': (35.1, 7.2), 'ВД2': (54.3, 8.5), 'ВД3': (48.5, 17.4), 'ВД4': (25.0, 17.8)}      # «Ø800 L35000 к ВДn»
KPD = [(31.0, 7.7), (48.2, 8.4), (20.9, 18.3), (44.5, 18.0)]                                      # КПД4-03 700×700 EI45
ROOMS = [('женская раздевалка и душевые', 0, 11, 4.4, 16.3), ('мужская раздевалка и душевые', 11, 24.5, 4.4, 9.3),
         ('мужская раздевалка', 18, 24.5, 9.3, 13.6), ('с/у', 11, 18, 9.3, 13.2), ('холл и ресепшн', 0, 11, 16.3, 22.8), ('тепловой пункт', 48, 54.3, 4.4, 7.2),
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
        sm = smoke_of[di]; dct['kind'] = 'smoke'
        dct['info'] = {'name': 'Дымоудаление %s: клапан КПД4-03 и выход Ø800 на крышу' % sm,
                       'loc': '%s, под потолком; вертикальный короб Ø800 к крышному вентилятору %s' % (room, sm),
                       'desc': 'Точка системы дымоудаления %s (лист 7 проекта ОВ): нормально закрытый противопожарный клапан КПД4-03 700×700 (EI45) и круглый воздуховод Ø800 вверх, на крышный вентилятор. Расход 35 000 м³/ч. В обычном режиме не работает — включается автоматикой пожарной сигнализации.' % sm,
                       'off': 'Вручную не открывать и не закрывать. Это путь удаления дыма при пожаре: неисправный клапан или вентилятор — заявка в HJ Track с пометкой «пожарная безопасность».',
                       'steps': ['При пожаре ничего не трогать — система запускается сама от сигнализации.', 'Если после тревоги нет шума вентилятора на крыше — сообщить менеджеру, в заявке указать номер системы %s.' % sm, 'Проверка клапанов — только обслуживающей организацией по графику.'],
                       'warn': 'Не загораживать клапан инвентарём и не закрывать его подвесным потолком без лючка.'}
    elif x1 < 0.6 and L < 1.5:
        dct['kind'] = 'other'
        dct['info'] = {'name': 'Переточная решётка ПР200×200 (стена пристройки)', 'loc': room + ', в стене между залом и пристройкой',
                       'desc': 'Переточная решётка 200×200 (лист 7 проекта ОВ): через неё воздух перетекает из холла в пристройку, чтобы вытяжка не создавала разрежения.',
                       'off': 'Закрытая решётка — двери начнут «присасываться», в пристройке станет душно.',
                       'steps': ['Не заклеивать, не закрывать мебелью.'], 'warn': 'Это не вентилятор, там нечего включать.'}
    elif L < 1.6:
        kind = dct['kind']
        if kind == 'supply':
            dct['info'] = {'name': 'Приточный диффузор SAD300×300 (приток ПВ1)', 'loc': room + ', потолок; ответвление Ø160–200 от приточной магистрали',
                           'desc': 'Потолочный приточный диффузор 300×300 на ответвлении от магистрали притока установки ПВ1 (лист 7 проекта ОВ). Таких по залам десятки — через них в зал подаётся свежий воздух.',
                           'off': 'Закрытый или заклеенный диффузор — соседние начинают дуть сильнее, в этой точке зала душно.',
                           'steps': ['Если дует слишком сильно/слабо — не регулировать самостоятельно, заявка на наладку.', 'Пыль на диффузоре — в заявку на уборку.'],
                           'warn': 'Не закрывать и не заклеивать.'}
        elif kind == 'exhaust':
            dct['info'] = {'name': 'Вытяжная решётка (вытяжка ПВ1)', 'loc': room + ', потолок; ответвление от вытяжной магистрали',
                           'desc': 'Вытяжная решётка на ответвлении от магистрали вытяжки установки ПВ1 (лист 7 проекта ОВ): через неё отработанный воздух уходит обратно в установку и на улицу.',
                           'off': 'Закрытая решётка нарушает баланс: приток остаётся, вытяжка нет — духота, запотевшие зеркала.',
                           'steps': ['Запах или шум из решётки — заявка в HJ Track с указанием помещения.'], 'warn': 'Не закрывать и не заклеивать.'}
        else:
            dct['info'] = {'name': 'Диффузор / решётка вентиляции', 'loc': room + ', потолок',
                           'desc': 'Точка раздачи или забора воздуха общеобменной вентиляции (лист 7 проекта ОВ): потолочный диффузор или решётка на ответвлении от магистрали.',
                           'off': 'Закрытая или заклеенная решётка нарушает баланс воздуха в помещении — духота или сквозняк у соседей.',
                           'steps': ['Если дует слишком сильно/слабо — не регулировать самостоятельно, заявка на наладку.', 'Пыль на решётке — в заявку на уборку.'],
                           'warn': 'Не закрывать и не заклеивать.'}
    else:
        hit = [dct['run']] if dct['run'] else []
        kinds = {r['kind'] for r in hit}
        if kinds == {'supply'}: head = 'ПРИТОК (от ПВ1)'
        elif kinds == {'exhaust'}: head = 'ВЫТЯЖКА (к ПВ1)'
        elif kinds == {'exhaust_fans'}: head = 'ВЫТЯЖКА (к вентиляторам В1–В3)'
        elif kinds: head = 'ПРИТОК и ВЫТЯЖКА рядом'
        else: head = 'Воздуховод вентиляции'
        parts = '; '.join(r['name'] for r in hit) if hit else ', '.join(rooms)
        dct['info'] = {'name': '%s — %s' % (head, parts),
                       'loc': '%s; под потолком, длина %.0f м, ширина ≈ %.0f см' % (', '.join(rooms), L, wid * 100),
                       'desc': ('Лист 7 проекта ОВ. Приток: установка ПВ1 (12 000 м³/ч) в венткамере на восточном торце, магистрали 1200×500 → ветки Ø200–Ø630 с диффузорами SAD300×300 по залам, раздевалкам и холлу. '
                                'Вытяжка ПВ1 (11 800 м³/ч): щелевые решётки CHB в коридоре и решётки RAG. Душевые, с/у и раздевалки дополнительно тянут вентиляторы В1 (2000 м³/ч), В2 (1500) и В3 (530) на антресоли пристройки. '
                                'Определение приток/вытяжка — по подписям диффузоров (SAD = приток, RAG/CHB = вытяжка) и по тому, к какой установке ведёт короб.'),
                       'off': 'Перекрыть воздуховод нельзя — только остановить установку ПВ1 (щит в венткамере) или вытяжной вентилятор В1–В3 на антресоли.',
                       'steps': ['Шум, свист, капли или запах из воздуховода — заявка в HJ Track с указанием помещения.', 'Не ставить оборудование вплотную к открытым решёткам.'],
                       'warn': 'Воздуховод не рассчитан на нагрузку: не вешать на него ничего и не опираться.'}

# ================= 2б. АНТРЕСОЛЬ: блок «План второго этажа» на листах 5 и 7 =================
def block_transform(dd):
    import collections as _c
    V = _c.defaultdict(float); Hh = _c.defaultdict(float)
    for s in dd['segs']:
        if not (s['c'] == [0,0,0] and 0.72 <= s['w'] < 1.0 and not s['f']): continue
        for (ax, ay), (bx, by) in zip(s['pts'], s['pts'][1:]):
            if not (2000 < ax < 2440 and 200 < ay < 800): continue
            Ls = math.hypot(bx - ax, by - ay)
            if Ls < 5: continue
            if abs(bx - ax) < 0.3: V[round(ax)] += Ls
            if abs(by - ay) < 0.3: Hh[round(ay)] += Ls
    bx0 = min(x for x, L in V.items() if L >= 250); by1 = max(y for y, L in Hh.items() if L >= 120)
    print('  блок антресоли: левая стена x=%.0f, верх y=%.0f' % (bx0, by1))
    return lambda x, y: ((x - bx0) * S_OV - 7.3, (by1 - y) * S_OV - 0.4)
T7b = block_transform(ov7); T5b = block_transform(ov5)
m = Image.new('L', (Wpx, Hpx), 0)
draw_lines(m, ov7['segs'], T7b, 2, lambda s: s['c'] == [0,0,0] and s['w'] == 1.08 and not s['f'] and all(x > 2000 for x, _ in s['pts']))
d2 = np.array(m) > 0
d2[:, ~((xs > -7.4) & (xs < 0.2))] = False; d2[~((zs > -0.6) & (zs < 18.5)), :] = False
_, d2m = mask_to_shapes(d2, min_area=0.1, close=8, open_=2, simplify_m=0.05)
top = np.zeros_like(d2m, dtype=bool); top[zs < 3.6, :] = True
ducts2 = []
for part, kind in ((((d2m > 0) & top), 'exhaust_fans'), (((d2m > 0) & ~top), 'supply')):
    shp, _ = mask_to_shapes(part, min_area=0.05, close=0, open_=0, simplify_m=0.05)
    for sh in shp: sh['kind'] = kind
    ducts2 += shp
for dct in ducts2:
    P = np.array(dct['outer']); x0, z0 = P.min(0); x1, z1 = P.max(0); cz = P[:, 1].mean()
    if dct['kind'] == 'exhaust_fans':
        dct['info'] = {'name': 'Антресоль: вытяжные вентиляторы В1, В2, В3 и их короба', 'loc': 'антресоль пристройки, склад (+4.5 м), у северной стены',
                       'desc': 'Три вытяжных вентилятора по листу 7 проекта ОВ: В1 — 2000 м³/ч (короб 400×200, душевые и раздевалки), В2 — 1500 м³/ч (300×200, с/у), В3 — 530 м³/ч (200×150). Выброс через шумоглушитель LDC250-600 и решётку наружу.',
                       'off': 'Стоят вентиляторы — в душевых и с/у сырость, конденсат и запахи; плесень на швах за пару недель.',
                       'steps': ['Запах сырости/затхлости в раздевалках — проверь щиты В1–В3 (горит «работа»?).', 'Перезапуск кнопкой — один раз.', 'Создай заявку, укажи какая система не работает.'],
                       'warn': 'Вытяжки санузлов должны работать всё время работы клуба.'}
    else:
        dct['info'] = {'name': 'Антресоль: приточные короба 200×150 (SAD300×300 Ø160) — кухня персонала, комната отдыха, отдел продаж', 'loc': 'антресоль пристройки (+4.5 м), под потолком вдоль помещений',
                       'desc': 'Два приточных короба 200×150 по листу 7 проекта ОВ идут вдоль антресоли и раздают воздух диффузорами SAD300×300 (Ø160, 120–140 м³/ч) в кухню персонала (18), комнату отдыха (17) и отдел продаж (16).',
                       'off': 'Без притока в этих комнатах быстро душно — они маленькие и без окон на улицу.',
                       'steps': ['Душно на антресоли — проверить, работает ли приток (щит ПВ1 в венткамере) и не закрыты ли диффузоры.'],
                       'warn': 'Не закрывать диффузоры коробками со склада.'}
print('воздуховоды антресоли: %d фигур' % len(ducts2))

# ================= 2в. ФАНКОЙЛЫ (лист 5: прямоугольники на концах веток T11/T21/T91/T92) =================
def fancoil_cands(segs, T, xmin, xmax):
    out = []
    for s in segs:
        if not (s['c'] == [0,0,0] and s['w'] == 1.08 and not s['f']) or len(s['pts']) < 3: continue
        if not all(xmin <= x <= xmax for x, _ in s['pts']): continue
        P = [T(x, y) for x, y in s['pts']]
        px_ = [p[0] for p in P]; pz_ = [p[1] for p in P]
        w, h = max(px_) - min(px_), max(pz_) - min(pz_)
        if 0.45 <= max(w, h) <= 1.6 and 0.4 <= min(w, h) <= 1.3:
            out.append(((min(px_) + max(px_)) / 2, (min(pz_) + max(pz_)) / 2, w, h))
    res = []
    for c in sorted(out):
        if all(math.hypot(c[0] - f[0], c[1] - f[1]) > 0.6 for f in res): res.append(c)
    return res
FC_TYPES = {'FC10': ('FC10CLB43/1P1L', 1.25, 6.17), 'FC05': ('FC05CLB43/1P1L', 2.0, 3.04), 'FC03': ('FC03CLB43/1P1L', 0.81, 1.46)}
fancoils = []
for (fx, fz, fw, fh), lvl in [(c, 0) for c in fancoil_cands(ov5['segs'], T_ov5, 0, 1990)] + [(c, 1) for c in fancoil_cands(ov5['segs'], T5b, 2000, 2446)]:
    if lvl == 0 and not (-0.5 < fx < 61 and 4.0 < fz < 23.5): continue
    if lvl == 1 and not (-7.4 < fx < 0 and -0.5 < fz < 18.5): continue
    room = room_of(fx, fz) if lvl == 0 else ('склад' if fz < 3.5 else 'кухня персонала' if fz < 8 else 'комната отдыха' if fz < 13 else 'отдел продаж')
    t = 'FC10' if room in ('FT zone', 'Legs zone', 'Bootcamp zone', 'Upper/FFB zone') else 'FC05' if room == 'коридор' else 'FC03'
    model, qt, qx = FC_TYPES[t]
    fancoils.append({'x': round(float(fx), 2), 'z': round(float(fz), 2), 'w': round(float(fw), 2), 'd': round(float(fh), 2), 'y': 7.4 if lvl else 3.75,
                     'room': room, 'model': model, 'qt': qt, 'qx': qx, 'lvl': lvl})
fancoils.sort(key=lambda f: (f['lvl'], f['x']))
for i, f in enumerate(fancoils, 1):
    f['info'] = {'name': 'Фанкойл №%d %s — %s' % (i, f['model'].split('/')[0], f['room']),
                 'loc': '%s%s, под потолком; 4-трубный: отопление T11/T21 + холод T91/T92, дренаж Д' % (f['room'], ' (антресоль +4.5 м)' if f['lvl'] else ''),
                 'desc': 'Канальный фанкойл %s по листу 5 проекта ОВ: тепло %.2f кВт, холод %.2f кВт. Летом гонит воздух через холодный теплообменник (гликоль от холодстанции), зимой — через горячий (от теплового пункта). Тип принят по надписям на чертеже для этой зоны.' % (f['model'], f['qt'], f['qx']),
                 'off': 'Закрытие пары кранов T91/T92 (или T11/T21) отключает только этот блок: его участок зала станет теплее/холоднее, остальные работают.',
                 'steps': ['Капает с потолка под блоком — подставь ведро, огороди зону: забит дренаж или конденсат.', 'Не дует — проверь, включён ли блок на пульте/щите зоны.', 'Заявка в HJ Track с номером блока и зоной.'],
                 'warn': 'Краны и дренаж — над подвесным потолком, работа со стремянки только вдвоём и при выключенном блоке.'}
print('фанкойлы: %d (зал %d, антресоль %d)' % (len(fancoils), sum(1 for f in fancoils if not f['lvl']), sum(1 for f in fancoils if f['lvl'])))

# ================= 2г. ВЕРТИКАЛЬНЫЕ УЧАСТКИ =================
risers = []
for di, sm in smoke_of.items():
    c = centers[di][0]
    risers.append({'x': round(float(c[0]), 2), 'z': round(float(c[1]), 2), 'r': 0.4, 'y0': 4.0, 'y1': 6.2, 'info': dict(ducts[di]['info'], name='Дымоудаление %s: короб Ø800 через кровлю к вентилятору' % sm)})
for dct in ducts:
    P = np.array(dct['outer'])
    if P[:, 0].min() < 0.8 and np.ptp(P, axis=0).max() > 5:
        zz = P[P[:, 0] < 0.8][:, 1].mean()
        risers.append({'x': 0.3, 'z': round(float(zz), 2), 'r': 0.25, 'y0': 3.95, 'y1': 7.4,
                       'info': {'name': 'Стояк вытяжки: из душевых и раздевалок через стену на антресоль к В1/В2', 'loc': 'западная стена зала, под потолком → антресоль пристройки',
                                'desc': 'Вытяжные короба 400×200 и 300×200 из душевых и раздевалок (решётки RAG) уходят через стену вверх, на антресоль, к вентиляторам В1 (2000 м³/ч) и В2 (1500 м³/ч).',
                                'off': 'Стоит В1/В2 — влажный воздух из душевых не удаляется.', 'steps': ['Сырость и запах в душевых — проверить В1/В2 на антресоли.'], 'warn': 'Не закрывать лючки доступа к стояку.'}})
print('стояки: %d' % len(risers))

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

# ================= 2в. МАГИСТРАЛИ ЦЕЛИКОМ (03.11.2026: «показывай зелёные трубы полностью») =================
# Маска воздуховодов рвётся там, где на листе 7 линии короба перекрыты подписями, поэтому магистрали собираем явно:
# полилинии (x, z) сняты с толстых (1.08) линий листа 7 (см. tools/plan/README.md), ширина w — по проекту.
SPINES = [
  dict(run=RUNS[0], w=0.40, pts=[(26.2,5.3),(47.9,5.3),(47.9,7.5),(54.4,7.5),(54.4,5.3),(59.3,5.3)]),       # северная FT/Legs, обход ТП с юга
  dict(run=RUNS[1], w=0.40, pts=[(26.2,12.2),(41.6,12.2),(41.6,13.35),(59.3,13.35)]),                        # южная FT/Legs, дальше вдоль коридора
  dict(run=RUNS[2], w=0.35, pts=[(10.7,13.9),(58.6,13.9),(58.6,19.6),(60.9,19.6)]),                         # вытяжка вдоль коридора → ПВ1
  dict(run=RUNS[3], w=0.45, pts=[(14.2,15.6),(59.3,15.6)]),                                                   # северная Bootcamp/Upper
  dict(run=RUNS[4], w=0.45, pts=[(14.2,21.4),(59.3,21.4)]),                                                   # южная Bootcamp/Upper
  dict(run=RUNS[5], w=0.60, pts=[(59.3,5.3),(59.3,21.4)]),                                                    # стояк-коллектор 1200×500 у венткамеры
  dict(run=RUNS[5], w=0.50, pts=[(59.3,12.4),(60.9,12.4)]),                                                   # ввод в установку ПВ1
]
spine_runs = {id(sp['run']) for sp in SPINES}
# старые рваные куски этих магистралей убираем (диффузоры и решётки остаются)
ducts = [d for d in ducts if not (d.get('run') is not None and id(d['run']) in spine_runs and ' — ' in d['info']['name'])]
for sp in SPINES:
    run = sp['run']; w = sp['w']; L = sum(math.hypot(x1-x0, z1-z0) for (x0,z0),(x1,z1) in zip(sp['pts'], sp['pts'][1:]))
    head = {'supply': 'ПРИТОК (от ПВ1)', 'exhaust': 'ВЫТЯЖКА (к ПВ1)', 'exhaust_fans': 'ВЫТЯЖКА (к вентиляторам В1–В3)'}[run['kind']]
    info = {'name': '%s — %s' % (head, run['name']),
            'loc': 'под потолком, магистраль целиком: длина %.0f м, ширина ≈ %.0f см (трасса по листу 7 проекта ОВ)' % (L, w * 100),
            'desc': ('Лист 7 проекта ОВ. Приток: установка ПВ1 (12 000 м³/ч) в венткамере на восточном торце → стояк-коллектор 1200×500 вдоль восточной стены → '
                     'четыре магистрали Ø200–Ø630 вдоль залов с потолочными диффузорами SAD300×300 и ветка Ø630 в раздевалки и холл. '
                     'Вытяжка ПВ1 (11 800 м³/ч): магистраль вдоль коридора со щелевыми решётками CHB1245×68, возвращается в ту же установку. '
                     'Магистраль показана непрерывно от установки до последнего диффузора; на чертеже она местами скрыта подписями.'),
            'off': 'Перекрыть магистраль нельзя — только остановить установку ПВ1 (щит в венткамере). Остановка = через час в залах душно.',
            'steps': ['Шум, свист, капли конденсата или запах из воздуховода — заявка в HJ Track с указанием зала и места.',
                      'Если в одном зале не дует ни из одного диффузора — проблема на этой магистрали или её заслонке: заявка «вентиляция, зал …».'],
            'warn': 'Воздуховод не рассчитан на нагрузку: не вешать на него ничего и не опираться стремянкой.'}
    for (x0,z0),(x1,z1) in zip(sp['pts'], sp['pts'][1:]):
        xa, xb = min(x0,x1) - w/2, max(x0,x1) + w/2; za, zb = min(z0,z1) - w/2, max(z0,z1) + w/2
        ducts.append({'outer': [[round(xa,2),round(za,2)],[round(xb,2),round(za,2)],[round(xb,2),round(zb,2)],[round(xa,2),round(zb,2)]],
                      'holes': [], 'kind': run['kind'], 'info': info, 'run': run})
print('магистрали целиком: %d трасс, воздуховодов всего %d' % (len(SPINES), len(ducts)))

for dct in ducts: dct.pop('run', None)
json.dump({'bbox': [XMIN, ZMIN, XMAX, ZMAX], 'walls': walls, 'ducts': ducts, 'ducts2': ducts2, 'fancoils': fancoils, 'risers': risers, 'heat': heat, 't3': t3, 't4': t4},
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
