"""TSDF-сплавление кадров по позам из reg.npz -> поверхность (marching cubes) -> GLB + облако для вьюера.
python fuse.py rec.npz reg.npz out_dir  [VOX=0.004 TRUNC=4 MAXVOX=30e6]"""
import sys, os, time, json, struct
sys.path.insert(0, os.path.dirname(__file__)); import nprand_shim  # noqa
import numpy as np
from skimage.measure import marching_cubes
from scipy.spatial import cKDTree

REC, REG, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)
VOX = float(os.environ.get('VOX', 0.004)); TRUNC_V = float(os.environ.get('TRUNC', 4)); MAXVOX = float(os.environ.get('MAXVOX', 30e6))
ZMIN = float(os.environ.get('ZMIN', 0.1)); ZMAX = float(os.environ.get('ZMAX', 1.5))
MIN_COMP = int(os.environ.get('MIN_COMP', 300))     # удалять островки меньше N треугольников

rec = np.load(REC); reg = np.load(REG)
depth, color, K = rec['depth'], rec['color'], rec['K']
poses = reg['poses']; P_cloud, C_cloud = reg['P'], reg['C']
N, H, W = depth.shape
fx, fy, cx, cy = K[0, 0], K[1, 1], K[0, 2], K[1, 2]
lut_fwd = rec['lut']                                  # прямолинейный -> искажённый (для проекции)
r_max = np.sqrt(max(cx, W - cx) ** 2 + max(cy, H - cy) ** 2)

# --- объём ---
lo = P_cloud.min(0) - 0.03; hi = P_cloud.max(0) + 0.03
dims = np.ceil((hi - lo) / VOX).astype(int)
while np.prod(dims) > MAXVOX:
    VOX *= 1.25; dims = np.ceil((hi - lo) / VOX).astype(int)
TRUNC = TRUNC_V * VOX
print('объём %s вокселей по %.1f мм (%.1f млн), усечение %.0f мм' % (dims.tolist(), VOX * 1000, np.prod(dims) / 1e6, TRUNC * 1000))
tsdf = np.ones(np.prod(dims), np.float32); wsum = np.zeros(np.prod(dims), np.float32); cvol = np.zeros((np.prod(dims), 3), np.float32)
gi = np.indices(dims).reshape(3, -1).T.astype(np.float32)
centers = lo.astype(np.float32) + (gi + 0.5) * VOX

t0 = time.time()
CH = 3_000_000
for i in range(N):
    Rm, t = poses[i][:3, :3], poses[i][:3, 3]
    z_img = depth[i]; valid = np.isfinite(z_img) & (z_img > ZMIN) & (z_img < ZMAX)
    for s in range(0, len(centers), CH):
        X = centers[s:s + CH]
        Pc = (X - t) @ Rm                            # мир -> камера (R^T)
        z = Pc[:, 2]; ok = z > ZMIN * 0.5
        if not ok.any(): continue
        x = Pc[:, 0] / np.where(ok, z, 1); y = Pc[:, 1] / np.where(ok, z, 1)
        rr = np.sqrt((x * fx) ** 2 + (y * fy) ** 2)
        mag = 1.0 + np.interp(rr / r_max * (len(lut_fwd) - 1), np.arange(len(lut_fwd)), lut_fwd)
        u = np.round(x * fx * mag + cx).astype(int); v = np.round(y * fy * mag + cy).astype(int)
        ok &= (u >= 0) & (u < W) & (v >= 0) & (v < H)
        if not ok.any(): continue
        uu, vv = u[ok], v[ok]
        dz = z_img[vv, uu]; vmask = valid[vv, uu]
        sdf = dz - z[ok]
        upd = vmask & (sdf > -TRUNC)
        idx = np.nonzero(ok)[0][upd]
        val = np.minimum(1.0, sdf[upd] / TRUNC).astype(np.float32)
        w_old = wsum[s + idx]; w_new = w_old + 1
        tsdf[s + idx] = (tsdf[s + idx] * w_old + val) / w_new
        near = np.abs(sdf[upd]) < TRUNC * 0.5
        ci = idx[near]; col = color[i][vv[upd][near], uu[upd][near]].astype(np.float32)
        cw = w_old[near]
        cvol[s + ci] = (cvol[s + ci] * cw[:, None] + col) / (cw + 1)[:, None]
        wsum[s + idx] = w_new
    if i % 15 == 0 or i == N - 1:
        print('  кадр %d интегрирован (%.0fс)' % (i, time.time() - t0))

tsdf = tsdf.reshape(dims); wsum = wsum.reshape(dims); cvol = cvol.reshape(*dims, 3)
mask = wsum > 0
verts, faces, normals, _ = marching_cubes(tsdf, level=0.0, spacing=(VOX, VOX, VOX), mask=mask)
print('поверхность: %d вершин, %d треугольников' % (len(verts), len(faces)))

# --- убрать мелкие островки ---
if MIN_COMP > 0 and len(faces):
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    e = np.vstack([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
    g = coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(len(verts), len(verts)))
    ncomp, lab = connected_components(g, directed=False)
    fl = lab[faces[:, 0]]; cnt = np.bincount(fl, minlength=ncomp)
    keep_f = cnt[fl] >= MIN_COMP
    faces = faces[keep_f]
    used = np.unique(faces); remap = -np.ones(len(verts), int); remap[used] = np.arange(len(used))
    verts, normals = verts[used], normals[used]; faces = remap[faces]
    print('после чистки островков (<%d треуг.): %d вершин, %d треугольников, компонент было %d' % (MIN_COMP, len(verts), len(faces), ncomp))

# --- цвет вершин из цветового объёма (ближайший воксель с весом) ---
vi = np.clip(np.round(verts / VOX - 0.5).astype(int), 0, dims - 1)
vcol = cvol[vi[:, 0], vi[:, 1], vi[:, 2]]
empty = wsum[vi[:, 0], vi[:, 1], vi[:, 2]] == 0
if empty.any():
    obs = np.argwhere(wsum > 0); tree = cKDTree(obs)
    _, j = tree.query(vi[empty]); vcol[empty] = cvol[obs[j, 0], obs[j, 1], obs[j, 2]]
verts_w = (verts + lo).astype(np.float32)
# нормали marching cubes смотрят по градиенту tsdf (наружу от поверхности к свободному пространству) - для освещения ок
normals = -normals.astype(np.float32)


# --- экспорт GLB ---
def write_glb(path, V, Nn, Cc, F):
    V = np.ascontiguousarray(V, np.float32); Nn = np.ascontiguousarray(Nn, np.float32)
    C4 = np.concatenate([np.clip(Cc, 0, 255).astype(np.uint8), np.full((len(Cc), 1), 255, np.uint8)], 1)
    F = np.ascontiguousarray(F, np.uint32)
    bufs = [V.tobytes(), Nn.tobytes(), C4.tobytes(), F.tobytes()]
    views, offs, acc = [], 0, []
    for k, b in enumerate(bufs):
        pad = (-len(b)) % 4
        views.append({'buffer': 0, 'byteOffset': offs, 'byteLength': len(b), **({'target': 34963} if k == 3 else {'target': 34962})})
        offs += len(b) + pad; bufs[k] = b + b'\0' * pad
    acc.append({'bufferView': 0, 'componentType': 5126, 'count': len(V), 'type': 'VEC3', 'min': V.min(0).tolist(), 'max': V.max(0).tolist()})
    acc.append({'bufferView': 1, 'componentType': 5126, 'count': len(V), 'type': 'VEC3'})
    acc.append({'bufferView': 2, 'componentType': 5121, 'normalized': True, 'count': len(V), 'type': 'VEC4'})
    acc.append({'bufferView': 3, 'componentType': 5125, 'count': F.size, 'type': 'SCALAR'})
    gltf = {'asset': {'version': '2.0', 'generator': 'hj-lidar-fuse'}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0}],
            'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1, 'COLOR_0': 2}, 'indices': 3, 'material': 0}]}],
            'materials': [{'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0.0, 'roughnessFactor': 0.9}, 'doubleSide': True}],
            'bufferViews': views, 'accessors': acc, 'buffers': [{'byteLength': offs}]}
    gltf['materials'][0]['doubleSided'] = True; del gltf['materials'][0]['doubleSide']
    js = json.dumps(gltf, separators=(',', ':')).encode(); js += b' ' * ((-len(js)) % 4)
    bin_ = b''.join(bufs)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(bin_), 0x004E4942)); f.write(bin_)


write_glb(os.path.join(OUT, 'mesh.glb'), verts_w, normals, vcol, faces)
with open(os.path.join(OUT, 'pos.f32'), 'wb') as f: f.write(np.ascontiguousarray(P_cloud, np.float32).tobytes())
with open(os.path.join(OUT, 'col.u8'), 'wb') as f: f.write(np.ascontiguousarray(C_cloud, np.uint8).tobytes())
area = 0.5 * np.linalg.norm(np.cross(verts_w[faces[:, 1]] - verts_w[faces[:, 0]], verts_w[faces[:, 2]] - verts_w[faces[:, 0]]), axis=1).sum()
st = reg['stats']
meta = {'count': int(len(P_cloud)), 'frames': int(N), 'tris': int(len(faces)), 'verts': int(len(verts_w)), 'voxel_mm': round(VOX * 1000, 1),
        'area_m2': round(float(area), 3), 'extent_m': np.round(P_cloud.max(0) - P_cloud.min(0), 2).tolist(),
        'icp_rmse_mm': round(float(np.nanmean(st[:, 1])) * 1000, 1), 'path_cm': round(float(np.linalg.norm(poses[-1][:3, 3] - poses[0][:3, 3])) * 100, 1),
        'cam': [p[:3, 3].round(4).tolist() for p in poses]}
json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'))
print('GLB %.1f МБ, облако %.1f МБ, площадь поверхности %.2f м², время %.0fс' % (os.path.getsize(os.path.join(OUT, 'mesh.glb')) / 1e6, len(P_cloud) * 15 / 1e6, area, time.time() - t0))
