# LiDAR-скан → 3D-модель (Python)

Конвейер для записей приложения DepthCapture (iPhone LiDAR, контейнер ROS2 `.mcap`):
глубина 320×180 float32 + цвет JPEG + IMU → сшивка кадров → поверхность.

```
python tools/lidar/extract.py  recording.mcap  rec.npz        # разбор контейнера
python tools/lidar/register.py rec.npz reg.npz                # IMU + point-to-plane ICP, позы кадров
python tools/lidar/fuse.py     rec.npz reg.npz out/           # TSDF + marching cubes → mesh.glb, pos.f32, col.u8, meta.json
copy tools/lidar/viewer.html out/index.html                   # вьюер (three.js), кладётся в public/scan-preview/
```

Параметры через переменные окружения:

| переменная | по умолчанию | смысл |
|---|---|---|
| `ZMIN` / `ZMAX` | 0.1 / 1.5 м | рабочий диапазон глубины (для комнаты ставить `ZMAX=5`) |
| `VOX` | 0.004 м | воксель модели/TSDF (для комнаты 0.01–0.015) |
| `MAXVOX` | 30e6 | потолок числа вокселей, воксель увеличивается автоматически |
| `TRUNC` | 4 | усечение TSDF в вокселях |
| `MIN_COMP` | 300 | удалять островки поверхности меньше N треугольников |

## Про Python на ноутбуке Sales5

Smart App Control блокирует неподписанные DLL по репутации файла. Проходят проверенные сборки:
numpy 1.26.4 (кроме `numpy.random` — подменяется `nprand_shim.py`, импортировать его первым),
scipy 1.14.1, scikit-image 0.24.0, Pillow 10.4.0, opencv-python-headless 4.10.0.84, mcap, mcap-ros2-support.
Заблокированы: numpy 2.x, Pillow 13, open3d.

## Что проверено на тестовой записи (02.11.2026, 2.2 с, 60 кадров)

- глубина Apple — Z вдоль оси камеры (плоскость стола: 0.8 мм RMS), не дальность;
- ось «камера→устройство» = diag(1,−1,−1) для портретных кадров, IMU-кадр xMagneticNorthZVertical;
- ICP кадр-к-модели сходится с RMSE ≈ 2 мм, выравнивание по гравитации с точностью 2°.

## Как снимать помещение

Медленно (≤ 20°/с поворота), с перекрытием кадров, держать телефон 0.5–3 м от стен и труб,
обходить объекты по кругу, избегать резких рывков и съёмки «в пустоту» (нет точек — ICP теряет опору).
