"""Переводит public/building-3d.html на геометрию из club-geom.json (стены/воздуховоды/трубы по CAD) и
переставляет оборудование в систему координат плана (X: ось 1 = 0, Z: ось Е = 0)."""
import re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()

# ---- 1. константы здания ----
s = s.replace("/* Здание: X 0..54 м (вдоль), Z 0..22.5 м (поперёк), Y вверх. Потолок 4.8 м. */\nconst L=54, W=22.5, H=4.8;",
"/* Координаты — по осям проекта: X вдоль здания (ось 1 = 0, ось 11 = 60), Z поперёк (ось Е = 0, ось А = 22.5), Y вверх.\n   Основной зал: X 0..60.5, Z 4.4..22.8; пристройка с антресолью слева: X -6.2..0; тамбур справа. Потолок 4.8 м. */\nconst L=60.5, W=22.8, H=4.8;")
assert 'const L=60.5' in s

# ---- 2. блок корпуса здания ----
a = s.index('/* ----- корпус здания ----- */'); b = s.index('/* ----- маркеры оборудования ----- */')
new_bld = r'''/* ----- корпус здания: геометрия из CAD-чертежей проекта (tools/plan/build_geom.py) ----- */
const GEOM = await (await fetch('club-geom.json')).json();
const [GX0, GZ0, GX1, GZ1] = GEOM.bbox;
const bld = new THREE.Group(); scene.add(bld);

function box(w,h,d, x,y,z, color, opacity=1, rough=.85){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),
    new THREE.MeshStandardMaterial({color, roughness:rough, transparent:opacity<1, opacity}));
  m.position.set(x,y,z); bld.add(m); return m;
}
/* пол = сам план ВК (стены, мебель, трубы) в масштабе 2 см/пиксель */
const planTex = new THREE.TextureLoader().load('club-plan.jpg');
planTex.colorSpace = THREE.SRGBColorSpace; planTex.anisotropy = 8;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(GX1-GX0, GZ1-GZ0),
  new THREE.MeshStandardMaterial({map:planTex, roughness:.95}));
floor.rotation.x = -Math.PI/2; floor.position.set((GX0+GX1)/2, 0.012, (GZ0+GZ1)/2); bld.add(floor);
box(GX1-GX0, .2, GZ1-GZ0, (GX0+GX1)/2, -.1, (GZ0+GZ1)/2, 0x2a3443);

/* контур -> Shape (shape.y = -Z, потом поворот -90° по X даёт Z = -y, глубина выдавливания -> вверх) */
const toShape = (poly) => {
  const sh = new THREE.Shape(poly.outer.map(p => new THREE.Vector2(p[0], -p[1])));
  for (const h of poly.holes) sh.holes.push(new THREE.Path(h.map(p => new THREE.Vector2(p[0], -p[1]))));
  return sh;
};
const extrudeAll = (polys, depth, y0, mat) => {
  const g = new THREE.Group();
  for (const poly of polys){
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(toShape(poly), {depth, bevelEnabled:false}), mat);
    m.rotation.x = -Math.PI/2; m.position.y = y0; g.add(m);
  }
  bld.add(g); return g;
};
/* стены, перегородки, колонны — по кладочному плану */
const wallMat = new THREE.MeshStandardMaterial({color:0x7f93ad, transparent:true, opacity:.42, roughness:.6, depthWrite:false});
extrudeAll(GEOM.walls, H, 0, wallMat);
const wallEdgeMat = new THREE.LineBasicMaterial({color:0x9fb3cc, transparent:true, opacity:.55});
for (const poly of GEOM.walls){
  const rings = [poly.outer, ...poly.holes];
  for (const r of rings){
    const pts = r.map(p => new THREE.Vector3(p[0], H, p[1])); pts.push(pts[0].clone());
    bld.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wallEdgeMat));
  }
}
/* антресоль пристройки (+4.5 м, 94 м²): склад, кухня, комната отдыха, отдел продаж; там же вентустановки */
box(6.2, .25, 20.4, -3.1, 4.5, 9.8, 0x33404f, .9);
const mezzWall = new THREE.Mesh(new THREE.BoxGeometry(6.2, 3.3, 20.4),
  new THREE.MeshStandardMaterial({color:0x8fa3bd, transparent:true, opacity:.10, roughness:.4, depthWrite:false}));
mezzWall.position.set(-3.1, 4.5+1.65, 9.8); bld.add(mezzWall);
const mezzEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(6.2, 3.3, 20.4)),
  new THREE.LineBasicMaterial({color:0x4b5a70}));
mezzEdge.position.copy(mezzWall.position); bld.add(mezzEdge);
/* лестница на антресоль (в пристройке, у входа) */
for (let i = 0; i < 10; i++) box(1.1, 0.1, 0.34, -1.2, 0.24 + i * 0.45, 22.6 - i * 0.34, 0x3d4a5c);

/* детализация инженерки по листам ОВ: воздуховоды (лист 7) и трубы отопления (лист 5) */
const detail = {};
detail.vent = extrudeAll(GEOM.ducts, .45, 3.95,
  new THREE.MeshStandardMaterial({color:0x4ade80, transparent:true, opacity:.5, roughness:.6, emissive:0x4ade80, emissiveIntensity:.15}));
const linesFrom = (polys, y, color, opacity) => {
  const pts = [];
  for (const pl of polys) for (let i = 0; i < pl.length - 1; i++)
    pts.push(new THREE.Vector3(pl[i][0], y, pl[i][1]), new THREE.Vector3(pl[i+1][0], y, pl[i+1][1]));
  const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({color, transparent:true, opacity}));
  bld.add(l); return l;
};
detail.heat = linesFrom(GEOM.heat, 4.35, 0xf87171, .75);
detail.water = linesFrom(GEOM.t3, 4.15, 0xfb923c, .9);

/* зоны-подписи: имена по экспликации, положение по плану */
const ZONES = [
  {n:'FT zone',               x:33,   z:8.9,  w:21,  d:8.5, c:0x2d3b31},
  {n:'Legs zone',             x:51.5, z:10.4, w:12,  d:5.5, c:0x2d333b},
  {n:'Bootcamp zone',         x:23.5, z:19,   w:24,  d:7,   c:0x3b332d},
  {n:'Upper/FFB zone',        x:50,   z:19,   w:22,  d:7,   c:0x3b2d33},
  {n:'Женская раздевалка + душевые', x:5.5, z:10.5, w:11, d:11, c:0x3b2d3b},
  {n:'Мужская раздевалка + душевые', x:20.5, z:8.6, w:7.5, d:8.4, c:0x2d323b},
  {n:'С/У',                   x:14.5, z:11,   w:6.5, d:4,   c:0x403a2d},
  {n:'Холл · ресепшн',        x:6,    z:19.3, w:11,  d:6,   c:0x313b3b},
  {n:'Тепловой пункт',        x:51.2, z:5.7,  w:6.2, d:2.5, c:0x45302c},
  {n:'Холодстанция',          x:57.5, z:5.7,  w:6,   d:2.5, c:0x2c3845},
  {n:'Щитовая',               x:1.5,  z:21.8, w:2.5, d:1.5, c:0x45402c},
  {n:'Пристройка: вход, лестница', x:-3.1, z:22, w:6, d:5, c:0x33404f},
];
const MEZZ = [
  {n:'Склад',            z:3},
  {n:'Кухня персонала',  z:8},
  {n:'Комната отдыха',   z:12.5},
  {n:'Отдел продаж',     z:17},
];
function makeLabel(text, scale=1, color='#cbd5e1'){
  const c = document.createElement('canvas'); const ctx = c.getContext('2d');
  const fs = 44; ctx.font = `600 ${fs}px system-ui`;
  c.width = Math.ceil(ctx.measureText(text).width)+28; c.height = fs+22;
  const ctx2 = c.getContext('2d');
  ctx2.font = `600 ${fs}px system-ui`; ctx2.fillStyle = color;
  ctx2.textBaseline='middle'; ctx2.fillText(text, 14, c.height/2);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy=4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({map:tex, transparent:true, depthWrite:false}));
  sp.scale.set(c.width/55*scale, c.height/55*scale, 1);
  return sp;
}
const roomLabels = [];
for (const z of ZONES){
  const m = new THREE.Mesh(new THREE.PlaneGeometry(z.w, z.d),
    new THREE.MeshBasicMaterial({color:z.c, transparent:true, opacity:.35, depthWrite:false}));
  m.rotation.x = -Math.PI/2; m.position.set(z.x, .03, z.z); bld.add(m);
  const lb = makeLabel(z.n, 1.15, '#8b98ab');
  lb.position.set(z.x, .9, z.z); bld.add(lb);
  roomLabels.push(lb);
}
for (const m of MEZZ){
  const lb = makeLabel(m.n, 0.9, '#8b98ab');
  lb.position.set(-3.1, 4.5 + 1.1, m.z); bld.add(lb);
  roomLabels.push(lb);
}
/* входы: главный — через пристройку с юга, второй — тамбур на восточном торце */
const entr = makeLabel('⬇ Вход', 1.3, '#f97316');
entr.position.set(-3.1, 1.2, 25.2); bld.add(entr);
const entr2 = makeLabel('Вход (восток) ➡', 1.1, '#f97316');
entr2.position.set(63.5, 1.2, 14.5); bld.add(entr2);
/* чиллер снаружи — площадка за северной стеной у холодстанции */
box(5, .15, 3.4, 56.5, .08, 2.4, 0x1c2531);

'''
s = s[:a] + new_bld + s[b:]

# ---- 3. камера ----
s = s.replace("camera.position.set(L/2-38, 42, W+42);", "camera.position.set(-12, 40, 64);")
s = s.replace("controls.target.set(L/2, 0, W/2);", "controls.target.set(28, 0, 13);")
assert 'camera.position.set(-12, 40, 64)' in s

# ---- 4. фильтр систем: детализация ОВ/ВК включается чипами ----
s = s.replace("function applyFilter(){\n  for (const m of Object.values(markers)) m.group.visible = sysFilter[m.item.sys];\n  renderList();\n}",
"function applyFilter(){\n  for (const m of Object.values(markers)) m.group.visible = sysFilter[m.item.sys];\n  for (const [k, obj] of Object.entries(detail)) obj.visible = sysFilter[k];\n  renderList();\n}")
assert 'Object.entries(detail)' in s

# ---- 5. позиции оборудования ----
POS = {
 'vvod-v1':[0.6,0.5,21.6], 'uzel-t3':[49.4,0.9,5.3], 'uzel-t4':[50.6,0.9,5.3], 'drain-pump':[53.6,0.35,6.4],
 'kran-gvs-dush':[3.4,1.6,5.6], 'btp-shkaf':[52.2,1.5,6.6], 'btp-vvod':[48.5,0.7,4.9], 'btp-nasos':[50.0,0.6,6.3],
 'btp-predohr':[51.4,1.1,4.9], 'chiller':[56.5,1.4,2.4], 'glycol-pumps':[55.5,0.6,5.2], 'collector-hs':[56.8,1.0,6.4],
 'podpitka':[58.4,0.9,6.4], 'fancoil':[33,4.2,10.5], 'pv1':[-3.1,5.8,2.8], 'p2':[-3.1,5.8,7.5], 'kpd1':[20,4.4,11.6],
 'vd':[34,6.2,13], 'grshch':[1.6,1.5,21.4], 'shchit-zone':[33,1.6,13.5], 'pult-recep':[5,1.2,18.5],
 'pipe-v1':[20,3.9,15.3], 'pipe-t3':[28,4.15,13.3], 'pipe-t4':[28,4.3,13.6], 'pipe-k1':[8,0.12,5.0],
 'pipe-heat':[25,4.45,11.9], 'pipe-cold':[36,4.6,12.3], 'pipe-ventheat':[25,4.6,5.2],
}
for k, v in POS.items():
    pat = re.compile(r"(\{ id:'%s'[^\n]*?pos:)\[[^\]]*\]" % re.escape(k))
    s, n = pat.subn(lambda m: m.group(1) + str(v).replace(' ', ''), s)
    assert n == 1, k

# ---- 6. трассы труб ----
PATHS = {
 'pipe-v1': "[[0.6,0.2,21.6],[0.6,3.9,21.6],[13.3,3.9,21.6],[13.3,3.9,15.3],[42,3.9,15.3]],\n    [[13.3,3.9,15.3],[13.3,3.9,6.0],[3.4,3.9,6.0],[3.4,1.6,6.0]]",
 'pipe-t3': "[[49.2,1.2,5.0],[49.2,4.15,5.0],[41.5,4.15,5.0],[41.5,4.15,13.3],[15.6,4.15,13.3],[15.6,4.15,9.6],[8,4.15,9.6],[8,4.15,5.8],[3.7,4.15,5.8],[3.7,1.2,5.8]]",
 'pipe-t4': "[[4.0,1.2,6.1],[4.0,4.3,6.1],[8.3,4.3,6.1],[8.3,4.3,9.9],[15.9,4.3,9.9],[15.9,4.3,13.6],[41.8,4.3,13.6],[41.8,4.3,5.3],[49.5,4.3,5.3],[49.5,1.2,5.3]]",
 'pipe-k1': "[[3.5,0.12,5.0],[12,0.12,5.0]],\n    [[3.5,0.12,5.0],[3.5,0.12,3.0]],\n    [[12,0.12,5.0],[12,0.12,3.0]],\n    [[10.4,0.12,9.5],[10.6,0.12,5.1]]",
 'pipe-heat': "[[49,1.2,5.5],[49,4.45,5.5],[49,4.45,11.9],[2.5,4.45,11.9]],\n    [[49,4.45,11.9],[60,4.45,11.9]]",
 'pipe-cold': "[[56.2,1.2,5.5],[56.2,4.6,5.5],[56.2,4.6,12.3],[16,4.6,12.3]],\n    [[56.2,4.6,12.3],[60,4.6,12.3]]",
 'pipe-ventheat': "[[49,4.6,5.2],[0,4.6,5.2],[-3.1,4.6,5.2],[-3.1,5.4,4]]",
}
for k, v in PATHS.items():
    pat = re.compile(r"(\{ id:'%s'[^\n]*\n\s*paths:)\[.*?\],\n(\s*name:)" % re.escape(k), re.S)
    s, n = pat.subn(lambda m: m.group(1) + "[\n    " + v + ",\n  ],\n" + m.group(2), s)
    assert n == 1, k

open(p, 'w', encoding='utf-8').write(s)
print('ok', len(s))
