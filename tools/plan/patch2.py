"""Патч 2 к building-3d.html: цвета приток/вытяжка, антресольные короба, стояки, фанкойлы, ПВ1 в венткамере."""
import sys, re
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
def rep(old, new, cnt=1):
    global s
    assert old in s, old[:70]; s = s.replace(old, new, cnt)

# материал может зависеть от полигона
rep("    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(toShape(poly), {depth, bevelEnabled:false}), mat);",
    "    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(toShape(poly), {depth, bevelEnabled:false}), typeof mat === 'function' ? mat(poly) : mat);")
rep("""detail.vent = extrudeAll(GEOM.ducts, .45, 3.95,
  new THREE.MeshStandardMaterial({color:0x4ade80, transparent:true, opacity:.5, roughness:.6, emissive:0x4ade80, emissiveIntensity:.15}), true);""",
"""/* цвета вентиляции: приток — зелёный, вытяжка — бирюзовый, дымоудаление — розовый, прочее — серый */
const ductMat = (c, o=.55) => new THREE.MeshStandardMaterial({color:c, transparent:true, opacity:o, roughness:.6, emissive:c, emissiveIntensity:.15});
const ductMats = { supply: ductMat(0x4ade80), exhaust: ductMat(0x22d3ee), exhaust_fans: ductMat(0x22d3ee), smoke: ductMat(0xf472b6, .8), other: ductMat(0x9ca3af, .45) };
const matByKind = p => ductMats[p.kind] || ductMats.other;
detail.vent = extrudeAll(GEOM.ducts, .45, 3.95, matByKind, true);
/* антресоль пристройки: короба под её потолком (+7.35 м) */
{ const g2 = extrudeAll(GEOM.ducts2, .3, 7.35, matByKind, true); for (const c of [...g2.children]) detail.vent.add(c); bld.remove(g2); }
/* вертикальные участки: Ø800 дымоудаления через кровлю и стояк вытяжки на антресоль */
for (const r of GEOM.risers){
  const smoke = /Дымоудаление/.test(r.info.name);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r.r, r.r, r.y1 - r.y0, 16), smoke ? ductMats.smoke : ductMats.exhaust_fans);
  m.position.set(r.x, (r.y0 + r.y1) / 2, r.z);
  m.userData.item = {id:'riser-'+pickables.length, sys:'vent', type:'duct', pos:[r.x, (r.y0 + r.y1) / 2, r.z], ...r.info};
  pickables.push(m); detail.vent.add(m);
}
/* фанкойлы по листу 5 (4-трубные, под потолком) */
detail.cold = new THREE.Group(); bld.add(detail.cold);
const fcMat = new THREE.MeshStandardMaterial({color:0x60a5fa, emissive:0x60a5fa, emissiveIntensity:.3, roughness:.5});
GEOM.fancoils.forEach((f, i) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(f.w, .5), .32, Math.max(f.d, .5)), fcMat);
  m.position.set(f.x, f.y, f.z);
  m.userData.item = {id:'fc-'+i, sys:'cold', type:'fancoil', pos:[f.x, f.y, f.z], ...f.info};
  pickables.push(m); detail.cold.add(m);
});""")
rep("duct:'воздуховод'})[it.type]", "duct:'воздуховод',fancoil:'фанкойл'})[it.type]")

# ПВ1 — в венткамере на восточном торце; П2 → вытяжные вентиляторы В1–В3
rep("{ id:'pv1', sys:'vent', type:'unit', pos:[-3.1,5.8,2.8],", "{ id:'pv1', sys:'vent', type:'unit', pos:[61.7,1.4,16],")
rep("  name:'Приточно-вытяжная установка ПВ1',", "  name:'Приточно-вытяжная установка ПВ1 (12 000 / 11 800 м³/ч)',")
rep("  loc:'На кровле над душевыми (на 2-м этаже теперь офисы — установки вынесены на крышу)',",
    "  loc:'Венткамера на восточном торце здания (пристройка за залом Upper/FFB); забор воздуха — жалюзийная решётка 1300×1800 на фасаде. Магистрали 1200×500 уходят в зал под потолком',")
rep("{ id:'p2', sys:'vent', type:'unit', pos:[-3.1,5.8,7.5],", "{ id:'p2', sys:'vent', type:'unit', pos:[-3.1,5.8,1.8],")
rep("  name:'Приточная установка П2 + вытяжки В1–В3',", "  name:'Вытяжные вентиляторы В1, В2, В3 (антресоль пристройки)',")
rep("  loc:'Кровля над раздевалками',", "  loc:'Антресоль пристройки (+4.5 м), склад у северной стены; выброс через шумоглушитель LDC250-600 наружу',")
rep("  desc:'П2 обслуживает раздевалки и душевые, вытяжки В1–В3 удаляют влажный воздух из душевых и санузлов.',",
    "  desc:'В1 — 2000 м³/ч (короб 400×200): душевые и раздевалки; В2 — 1500 м³/ч (300×200): санузлы; В3 — 530 м³/ч (200×150). На планах вентиляции отдельной приточной П2 нет — приток всех помещений, включая антресоль, даёт ПВ1.',")

# зоны: венткамера вместо «восточного входа» (зигзаг на торце — жалюзийная решётка, не дверь)
rep("  {n:'Пристройка: вход, лестница', x:-3.1, z:22, w:6, d:5, c:0x33404f},",
    "  {n:'Пристройка: вход, лестница', x:-3.1, z:22, w:6, d:5, c:0x33404f},\n  {n:'Венткамера ПВ1', x:61.7, z:15.5, w:2.4, d:5.4, c:0x2d3b31},")
rep("const entr2 = makeLabel('Вход (восток) ➡', 1.1, '#f97316');\nentr2.position.set(63.5, 1.2, 14.5); bld.add(entr2);\n", "")
# легенда в подзаголовке
rep("<small>3D-схема инженерных систем — нажми на кран или пульт</small>",
    "<small>3D-схема инженерных систем — нажми на кран, пульт, трубу или воздуховод · <span style=\"color:#4ade80\">■</span> приток · <span style=\"color:#22d3ee\">■</span> вытяжка · <span style=\"color:#f472b6\">■</span> дымоудаление · <span style=\"color:#60a5fa\">■</span> фанкойлы</small>")
open(p, 'w', encoding='utf-8').write(s); print('patch2 ok')
