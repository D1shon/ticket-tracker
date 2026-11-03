"""Извлекает из recording.mcap глубину, цвет, IMU и калибровку в один .npz"""
import sys, types, json, io
sys.path.insert(0, __import__('os').path.dirname(__file__)); import nprand_shim  # SAC блокирует numpy.random
import numpy as np
from PIL import Image
from mcap.reader import make_reader
from mcap_ros2.decoder import DecoderFactory

SRC = sys.argv[1]; OUT = sys.argv[2]
depth=[]; dts=[]; color=[]; cts=[]; imu_t=[]; imu_q=[]; imu_g=[]; imu_w=[]; K=None; meta=None
with open(SRC,'rb') as f:
    r = make_reader(f, decoder_factories=[DecoderFactory()])
    for schema, ch, msg, d in r.iter_decoded_messages():
        t = ch.topic
        if t=='/camera/depth/image_rect':
            depth.append(np.frombuffer(bytes(d.data), dtype='<f4').reshape(d.height, d.width).copy())
            dts.append(d.header.stamp.sec + d.header.stamp.nanosec/1e9)
        elif t=='/camera/color/image/compressed':
            im = Image.open(io.BytesIO(bytes(d.data))).convert('RGB')
            color.append(np.asarray(im)); cts.append(d.header.stamp.sec + d.header.stamp.nanosec/1e9)
        elif t=='/camera/depth/camera_info' and K is None:
            K = np.array(d.k, dtype=np.float64).reshape(3,3)
        elif t=='/depthcapture/motion/raw':
            j = json.loads(d.data)
            imu_t.append(int(j['timestampNanoseconds'])/1e9)
            imu_q.append(j['attitudeQuaternion']); imu_g.append(j['gravityG']); imu_w.append(j['rotationRateRadiansPerSecond'])
        elif t=='/depthcapture/spatial/frame_metadata' and meta is None:
            meta = json.loads(d.data)['frameCalibration']['depth']['calibration']

depth=np.stack(depth); color=np.stack(color)
print('depth', depth.shape, 'color', color.shape, 'K fx=%.2f cx=%.2f cy=%.2f'%(K[0,0],K[0,2],K[1,2]))
print('imu samples', len(imu_t))
np.savez_compressed(OUT, depth=depth, dts=np.array(dts), color=color, cts=np.array(cts), K=K,
    imu_t=np.array(imu_t), imu_q=np.array(imu_q), imu_g=np.array(imu_g), imu_w=np.array(imu_w),
    lut_inv=np.array(meta['inverseLensDistortionLookupTable']), lut=np.array(meta['lensDistortionLookupTable']),
    dist_center=np.array([meta['lensDistortionCenter']['x'], meta['lensDistortionCenter']['y']]),
    ref_dims=np.array([meta['intrinsicMatrixReferenceDimensions']['width'], meta['intrinsicMatrixReferenceDimensions']['height']]))
# статистика
valid = np.isfinite(depth) & (depth>0)
print('valid %%: %.1f  depth range %.2f..%.2f m  median %.2f'%(valid.mean()*100, depth[valid].min(), depth[valid].max(), np.median(depth[valid])))
q = np.array(imu_q)  # x,y,z,w
from scipy.spatial.transform import Rotation as R
rots = R.from_quat(q)
rel = (rots[0].inv()*rots[-1]).magnitude()*180/np.pi
print('суммарный поворот телефона за запись: %.1f°'%rel)
Image.fromarray(color[0]).save(OUT.replace('.npz','_c0.png')); Image.fromarray(color[-1]).save(OUT.replace('.npz','_c59.png'))
d0 = depth[0].copy(); d0[~np.isfinite(d0)] = 0
Image.fromarray((np.clip(d0/ max(0.1, np.percentile(d0[d0>0],98)),0,1)*255).astype(np.uint8)).save(OUT.replace('.npz','_d0.png'))
