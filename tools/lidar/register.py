"""Сшивка кадров LiDAR: IMU-ориентация -> point-to-plane ICP кадр-к-модели. Вход rec.npz, выход reg.npz"""
import sys, os, time
sys.path.insert(0, os.path.dirname(__file__)); import nprand_shim  # noqa
import numpy as np
from scipy.spatial import cKDTree
from scipy.spatial.transform import Rotation as R, Slerp
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
ZMIN = float(os.environ.get('ZMIN', 0.1)); ZMAX = float(os.environ.get('ZMAX', 1.5))
VOX = float(os.environ.get('VOX', 0.004))          # воксель модели, м
d = np.load(SRC)
depth, color, dts, K = d['depth'], d['color'], d['dts'], d['K']
imu_t, imu_q = d['imu_t'], d['imu_q']
N, H, W = depth.shape
fx, fy, cx, cy = K[0, 0], K[1, 1], K[0, 2], K[1, 2]

# --- сетка пикселей с поправкой дисторсии (inverse LUT: искажённый -> прямолинейный) ---
lut = d['lut_inv']
u, v = np.meshgrid(np.arange(W, dtype=np.float64), np.arange(H, dtype=np.float64))
du, dv = u - cx, v - cy
r = np.sqrt(du ** 2 + dv ** 2)
r_max = np.sqrt(max(cx, W - cx) ** 2 + max(cy, H - cy) ** 2)
mag = 1.0 + np.interp(r / r_max * (len(lut) - 1), np.arange(len(lut)), lut)
xn = du * mag / fx; yn = dv * mag / fy               # нормированные лучи


def unproject(i):
    z = depth[i]
    ok = np.isfinite(z) & (z > ZMIN) & (z < ZMAX)
    P = np.stack([xn * z, yn * z, z], -1)
    dx = np.roll(P, -1, 1) - np.roll(P, 1, 1); dy = np.roll(P, -1, 0) - np.roll(P, 1, 0)
    n = np.cross(dx, dy); ln = np.linalg.norm(n, axis=-1, keepdims=True); n = n / np.maximum(ln, 1e-12)
    jump = ((np.abs(np.roll(z, -1, 1) - z) > 0.02) | (np.abs(np.roll(z, 1, 1) - z) > 0.02) |
            (np.abs(np.roll(z, -1, 0) - z) > 0.02) | (np.abs(np.roll(z, 1, 0) - z) > 0.02))
    ok &= ~jump; ok[0, :] = ok[-1, :] = ok[:, 0] = ok[:, -1] = False
    flip = np.sum(n * P, -1) > 0; n[flip] *= -1       # нормали к камере
    return P[ok], n[ok], color[i][ok]


# --- проверка: глубина = Z вдоль оси или дальность? (плоскость стола в нижней части кадра 0) ---
z0 = depth[0]; m = np.isfinite(z0) & (z0 > ZMIN) & (z0 < ZMAX); m[:H // 2] = False
rng = z0 / np.sqrt(xn ** 2 + yn ** 2 + 1)
for name, Pz in (('Z-depth', np.stack([xn * z0, yn * z0, z0], -1)), ('range', np.stack([xn * rng, yn * rng, rng], -1))):
    Q = Pz[m]; Q = Q - Q.mean(0); s = np.linalg.svd(Q, compute_uv=False)
    print('%s: RMS отклонения от плоскости стола %.2f мм' % (name, s[-1] / np.sqrt(len(Q)) * 1000))

# --- IMU: ориентация устройства на момент каждого кадра ---
rot = R.from_quat(imu_q)
tt = np.clip(dts, imu_t[0], imu_t[-1])
R_wd = Slerp(imu_t, rot)(tt)                         # мир <- устройство
C_list = {'diag(1,-1,-1)': np.diag([1., -1, -1]), 'diag(-1,1,-1)': np.diag([-1., 1, -1]),
          'rot90a': np.array([[0, 1, 0], [1, 0, 0], [0, 0, -1.]]), 'rot90b': np.array([[0, -1, 0], [-1, 0, 0], [0, 0, -1.]])}
frames = [unproject(i) for i in range(N)]


def sub(P, k):
    if len(P) <= k: return np.arange(len(P))
    return np.linspace(0, len(P) - 1, k).astype(int)


best = None
for name, C in C_list.items():
    errs = []
    for i, j in ((0, 20), (20, 40), (40, 59), (0, 59)):
        Ri = R_wd[i].as_matrix() @ C; Rj = R_wd[j].as_matrix() @ C
        Pi = frames[i][0] @ Ri.T; Pj = frames[j][0] @ Rj.T
        Pi = Pi - Pi.mean(0); Pj = Pj - Pj.mean(0)
        dd, _ = cKDTree(Pi).query(Pj[sub(Pj, 4000)]); errs.append(np.median(dd))
    e = float(np.mean(errs)); print('IMU-ось %-14s медианная невязка %.1f мм' % (name, e * 1000))
    if best is None or e < best[1]: best = (name, e)
C = C_list[best[0]]; print('выбрано:', best[0])
R_wc = np.array([R_wd[i].as_matrix() @ C for i in range(N)])


# --- ICP кадр-к-модели ---
def icp(P, model_P, model_N, T0, iters=25):
    tree = cKDTree(model_P); T = T0.copy()
    Ps = P[sub(P, 8000)]
    for it in range(iters):
        thr = 0.03 if it < 5 else (0.015 if it < 12 else 0.008)
        S = Ps @ T[:3, :3].T + T[:3, 3]
        dist, j = tree.query(S, distance_upper_bound=thr)
        ok = np.isfinite(dist)
        if ok.sum() < 200: return T, ok.mean(), np.nan
        D, Nn = model_P[j[ok]], model_N[j[ok]]; Sv = S[ok]
        res = np.sum((Sv - D) * Nn, -1)
        A = np.hstack([np.cross(Sv, Nn), Nn])
        w = 1.0 / (1.0 + (res / 0.005) ** 2)
        x = np.linalg.lstsq(A * w[:, None], -res * w, rcond=None)[0]
        dR = R.from_rotvec(x[:3]).as_matrix(); dt = x[3:]
        T_new = np.eye(4); T_new[:3, :3] = dR @ T[:3, :3]; T_new[:3, 3] = dR @ T[:3, 3] + dt
        T = T_new
        if np.linalg.norm(x) < 1e-5: break
    S = Ps @ T[:3, :3].T + T[:3, 3]; dist, j = tree.query(S, distance_upper_bound=0.01); ok = np.isfinite(dist)
    return T, ok.mean(), (np.sqrt(np.mean(dist[ok] ** 2)) if ok.any() else np.nan)


def voxel_merge(P, Cc, Nn, vox):
    key = np.floor(P / vox).astype(np.int64)
    _, inv = np.unique(key, axis=0, return_inverse=True)
    inv = inv.ravel(); cnt = np.bincount(inv).astype(np.float64)
    acc = lambda X: np.stack([np.bincount(inv, X[:, k]) for k in range(X.shape[1])], -1) / cnt[:, None]
    Pm, Cm, Nm = acc(P), acc(Cc.astype(np.float64)), acc(Nn)
    Nm /= np.maximum(np.linalg.norm(Nm, axis=-1, keepdims=True), 1e-9)
    return Pm, Cm, Nm


t0 = time.time()
poses = np.zeros((N, 4, 4)); poses[0] = np.eye(4); poses[0][:3, :3] = R_wc[0]
P0, N0, C0 = frames[0]
MP = P0 @ R_wc[0].T; MN = N0 @ R_wc[0].T; MC = C0.astype(np.float64)
MP, MC, MN = voxel_merge(MP, MC, MN, VOX)
stats = []
for i in range(1, N):
    Rrel = R_wc[i] @ R_wc[i - 1].T                   # относительный поворот по IMU (в мире)
    T0 = np.eye(4); T0[:3, :3] = Rrel @ poses[i - 1][:3, :3]; T0[:3, 3] = poses[i - 1][:3, 3]
    P, Nn, Cc = frames[i]
    T, fit, rmse = icp(P, MP, MN, T0)
    poses[i] = T; stats.append((fit, rmse))
    Pw = P @ T[:3, :3].T + T[:3, 3]; Nw = Nn @ T[:3, :3].T
    MP = np.vstack([MP, Pw]); MN = np.vstack([MN, Nw]); MC = np.vstack([MC, Cc])
    MP, MC, MN = voxel_merge(MP, MC, MN, VOX)
    if i % 10 == 0 or i == N - 1:
        print('кадр %2d: совпадение %.0f%%  RMSE %.1f мм  модель %d точек  (%.0fс)' % (i, fit * 100, rmse * 1000, len(MP), time.time() - t0))
st = np.array(stats); print('средняя RMSE по кадрам %.1f мм, мин. совпадение %.0f%%' % (np.nanmean(st[:, 1]) * 1000, np.nanmin(st[:, 0]) * 100))
tr = np.linalg.norm(poses[-1][:3, 3] - poses[0][:3, 3]); print('смещение телефона за запись: %.1f см' % (tr * 100))

# --- в систему three.js: Y вверх (ось Z мира IMU = вертикаль) ---
G = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0.]])
MPg = MP @ G.T; MNg = MN @ G.T
for i in range(N):
    Tg = np.eye(4); Tg[:3, :3] = G @ poses[i][:3, :3]; Tg[:3, 3] = G @ poses[i][:3, 3]; poses[i] = Tg
ctr = MPg.mean(0); MPg = MPg - ctr
for i in range(N): poses[i][:3, 3] -= ctr
np.savez_compressed(OUT, P=MPg.astype(np.float32), C=MC.astype(np.uint8), Nn=MNg.astype(np.float32), poses=poses, stats=st)
print('итог: %d точек, габариты %s м' % (len(MPg), np.round(MPg.max(0) - MPg.min(0), 2)))


def proj(P, Cc, ax0, ax1, path, res=700):
    a, b = P[:, ax0], P[:, ax1]
    ia = ((a - a.min()) / (a.max() - a.min() + 1e-9) * (res - 1)).astype(int)
    ib = ((b - b.min()) / (b.max() - b.min() + 1e-9) * (res - 1)).astype(int)
    img = np.zeros((res, res, 3)); cnt = np.zeros((res, res))
    np.add.at(img, (res - 1 - ib, ia), Cc); np.add.at(cnt, (res - 1 - ib, ia), 1)
    img = img / np.maximum(cnt, 1)[..., None]; Image.fromarray(img.astype(np.uint8)).save(path)


proj(MPg, MC, 0, 1, OUT.replace('.npz', '_front.png'))
proj(MPg, MC, 0, 2, OUT.replace('.npz', '_top.png'))
proj(MPg, MC, 2, 1, OUT.replace('.npz', '_side.png'))
