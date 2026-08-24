import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { AIDenoiserExtension } from 'agora-extension-ai-denoiser';
import { useTickets } from './TicketContext';
import { toast } from 'sonner';
import { db } from '../lib/firebase';
import { doc, setDoc, deleteDoc, updateDoc, deleteField, onSnapshot, collection, serverTimestamp, getDoc } from 'firebase/firestore';

const CallContext = createContext();

const APP_ID = 'bb4329d6bc93488596e037c5ad1a96c9';

// ── ИИ-шумоподавление Agora: убирает клавиатуру, вентиляторы, фоновый шум зала.
// WASM-модули лежат в public/denoiser; если браузер не поддерживает —
// остаёмся на встроенном браузерном шумодаве (ANS), звонок не ломается.
let denoiserExt = null;
try {
  denoiserExt = new AIDenoiserExtension({ assetsPath: '/denoiser' });
  if (denoiserExt.checkCompatibility && !denoiserExt.checkCompatibility()) {
    denoiserExt = null;
  } else {
    AgoraRTC.registerExtensions([denoiserExt]);
    denoiserExt.onloaderror = (e) => { console.warn('[denoiser] load error:', e); denoiserExt = null; };
  }
} catch (e) {
  console.warn('[denoiser] init failed:', e);
  denoiserExt = null;
}

async function attachDenoiser(audioTrack) {
  if (!denoiserExt || !audioTrack) return null;
  try {
    const processor = denoiserExt.createProcessor();
    audioTrack.pipe(processor).pipe(audioTrack.processorDestination);
    await processor.enable();
    // Мягкий режим — чтобы ИИ не «съедал» голос и не делал его роботизированным
    try { await processor.setLevel?.('SOFT'); } catch {}
    try { await processor.setMode?.('NSNG'); } catch {}
    // Если устройство не тянет обработку (слабый телефон) — авто-отключаем шумодав,
    // иначе голос звучит как робот. Лучше лёгкий фон, чем искажённая речь.
    processor.onoverload = async () => {
      console.warn('[denoiser] перегрузка — отключаю ИИ-шумодав, остаётся браузерный ANS');
      try { await processor.disable(); } catch {}
    };
    console.log('[denoiser] ИИ-шумоподавление включено (мягкий режим)');
    return processor;
  } catch (e) {
    console.warn('[denoiser] enable failed, используем браузерный ANS:', e);
    return null;
  }
}

// Map display names to stable Agora channel names
const ROOM_CHANNELS = {
  'Зал переговоров': 'main_room',
  'HR Отдел': 'hr_room',
};

function getChannel(displayName) {
  return ROOM_CHANNELS[displayName] || `custom_${displayName.replace(/\s+/g, '_').toLowerCase()}`;
}

export const CallProvider = ({ children }) => {
  const { user } = useTickets();
  const [isInCall, setIsInCall]             = useState(false);
  const [isJoining, setIsJoining]           = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [roomName, setRoomName]             = useState('');
  const [remoteUsers, setRemoteUsers]       = useState([]);   // { uid, videoTrack, audioTrack, isScreen }
  const [localVideoTrack, setLocalVideoTrack] = useState(null);
  const [localAudioTrack, setLocalAudioTrack] = useState(null);
  const [screenTrack, setScreenTrack]       = useState(null);

  // Room participant counts — fetched from Firestore for the lobby
  const [roomCounts, setRoomCounts]         = useState({});   // { channel: count }

  const clientRef   = useRef(null);
  const screenClientRef = useRef(null);
  const channelRef  = useRef('');
  const uidRef      = useRef(null);
  const heartbeatRef = useRef(null);
  const joiningRef  = useRef(false); // защита от двойного клика «войти»
  const leavingRef  = useRef(false); // защита от двойного клика «завершить»
  const denoiserRef = useRef(null);  // процессор ИИ-шумоподавления

  // ─── Listen to room-counts collection ──────────────────────────────────────
  useEffect(() => {
    let unsub;
    try {
      unsub = onSnapshot(collection(db, 'call_rooms'), (snap) => {
        const counts = {};
        const nowMs = Date.now();
        snap.docs.forEach(d => {
          const members = d.data().members || {};
          counts[d.id] = Object.values(members).filter(m => {
            if (!m.lastSeen) return true;
            const ts = m.lastSeen.toMillis ? m.lastSeen.toMillis() : 0;
            return nowMs - ts < 3 * 60 * 1000;
          }).length;
        });
        setRoomCounts(counts);
      }, (error) => {
        console.warn('[CallContext] Listener to call_rooms failed:', error);
      });
    } catch (e) {
      console.warn('[CallContext] onSnapshot call_rooms failed:', e);
    }
    return () => { if (unsub) unsub(); };
  }, []);

  // ─── Helpers to update Firestore room presence ──────────────────────────────
  const getMemberId = () =>
    user?.email?.replace(/[^a-zA-Z0-9]/g, '_') || `anon_${Math.random().toString(36).slice(2, 8)}`;

  const joinRoom = async (channel) => {
    try {
      const memberId = getMemberId();
      await setDoc(doc(db, 'call_rooms', channel), {
        members: { [memberId]: { name: user?.displayName || memberId, lastSeen: serverTimestamp() } }
      }, { merge: true });
    } catch (e) {
      console.warn('[CallContext] joinRoom error:', e);
    }
  };

  const leaveRoom = async (channel) => {
    try {
      const memberId = getMemberId();
      await updateDoc(doc(db, 'call_rooms', channel), {
        [`members.${memberId}`]: deleteField()
      });
    } catch (e) {
      console.warn('[CallContext] leaveRoom error:', e);
    }
  };

  const heartbeat = async () => {
    if (!channelRef.current) return;
    try {
      const memberId = getMemberId();
      await setDoc(doc(db, 'call_rooms', channelRef.current), {
        members: { [memberId]: { lastSeen: serverTimestamp() } }
      }, { merge: true });
    } catch (e) {}
  };

  // ─── Join ───────────────────────────────────────────────────────────────────
  const joinCall = async (displayName, opts = {}) => {
    // Повторный клик по «войти» (или клик во время подключения) молча игнорируем —
    // раньше это приводило к ошибкам «client already connecting»
    if (joiningRef.current || isInCall) return;
    joiningRef.current = true;
    setIsJoining(true);

    let createdAudioTrack = null;
    let createdVideoTrack = null;
    try {
      // Приватный созвон приходит со своим уникальным каналом — посторонние
      // через общий зал в него не попадут
      const channel = opts.channel || getChannel(displayName);
      channelRef.current = channel;

      setRoomName(displayName);
      clientRef.current = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

      // ── Remote user published (video / screen / audio) ──
      clientRef.current.on('user-published', async (user, mediaType) => {
        await clientRef.current.subscribe(user, mediaType);
        const isScreen = typeof user.uid === 'string' && user.uid.endsWith('_screen');

        if (mediaType === 'video') {
          setRemoteUsers(prev => {
            const existing = prev.find(u => u.uid === user.uid);
            if (existing) {
              return prev.map(u => u.uid === user.uid
                ? { ...u, videoTrack: user.videoTrack, isScreen }
                : u
              );
            }
            return [...prev, { uid: user.uid, videoTrack: user.videoTrack, audioTrack: null, isScreen }];
          });
        }

        if (mediaType === 'audio') {
          user.audioTrack?.play();
          setRemoteUsers(prev => {
            const existing = prev.find(u => u.uid === user.uid);
            if (existing) {
              return prev.map(u => u.uid === user.uid
                ? { ...u, audioTrack: user.audioTrack, isScreen }
                : u
              );
            }
            return [...prev, { uid: user.uid, videoTrack: null, audioTrack: user.audioTrack, isScreen }];
          });
        }
      });

      // ── Remote user unpublished ──
      clientRef.current.on('user-unpublished', (user, mediaType) => {
        if (mediaType === 'video') {
          setRemoteUsers(prev => prev.map(u =>
            u.uid === user.uid ? { ...u, videoTrack: null } : u
          ));
        }
        if (mediaType === 'audio') {
          setRemoteUsers(prev => prev.map(u =>
            u.uid === user.uid ? { ...u, audioTrack: null } : u
          ));
        }
      });

      // ── Remote user joined (ещё до публикации медиа) — показываем плитку сразу,
      //     чтобы участник без камеры/звука был виден в списке ──
      clientRef.current.on('user-joined', (u) => {
        const isScreen = typeof u.uid === 'string' && u.uid.endsWith('_screen');
        if (isScreen) return;
        setRemoteUsers(prev => prev.find(x => x.uid === u.uid)
          ? prev
          : [...prev, { uid: u.uid, videoTrack: null, audioTrack: null, isScreen: false }]);
      });

      // ── Remote user left ──
      clientRef.current.on('user-left', (user) => {
        setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid));
      });

      const mainUid = user?.email
        ? user.email.replace(/[^a-zA-Z0-9]/g, '_')
        : `user_${Math.floor(Math.random() * 1000000)}`;

      // Комната открывается СРАЗУ — вход в канал и захват камеры доделываются в фоне
      setIsInCall(true);

      // Главное ускорение входа: подключение к каналу и инициализация
      // камеры/микрофона идут ПАРАЛЛЕЛЬНО, а не по очереди
      // Речевой профиль вместo музыкального стерео: браузерное шумоподавление
      // работает в полную силу именно на речи
      const joinPromise = clientRef.current.join(APP_ID, channel, null, mainUid);
      const tracksPromise = AgoraRTC.createMicrophoneAndCameraTracks(
        { encoderConfig: 'speech_standard', AEC: true, ANS: true, AGC: true },
        { encoderConfig: { width: 1280, height: 720, frameRate: 30 } }
      ).catch(async (deviceErr) => {
        console.warn('[CallContext] Failed to get both mic and camera, trying mic only:', deviceErr);
        try {
          return [await AgoraRTC.createMicrophoneAudioTrack({
            encoderConfig: 'speech_standard', AEC: true, ANS: true, AGC: true
          }), null];
        } catch (micErr) {
          console.warn('[CallContext] Failed to get mic, trying camera only:', micErr);
          try {
            return [null, await AgoraRTC.createCameraVideoTrack({
              encoderConfig: { width: 1280, height: 720, frameRate: 30 }
            })];
          } catch (camErr) {
            console.warn('[CallContext] No audio/video devices accessible, joining as listener:', camErr);
            toast.info('Камера и микрофон не найдены или заблокированы. Вы вошли в режиме слушателя.');
            return [null, null];
          }
        }
      });

      const [uid, [audioTrack, videoTrack]] = await Promise.all([joinPromise, tracksPromise]);
      uidRef.current = uid;

      // Пока подключались, пользователь мог нажать «Завершить» — освобождаем устройства
      if (channelRef.current !== channel) {
        try { audioTrack?.stop(); audioTrack?.close(); } catch {}
        try { videoTrack?.stop(); videoTrack?.close(); } catch {}
        try { await clientRef.current?.leave(); } catch {}
        return;
      }

      const tracksToPublish = [];
      if (audioTrack) {
        createdAudioTrack = audioTrack;
        // ИИ-шумоподавление поверх браузерного (не блокирует вход при сбое)
        denoiserRef.current = await attachDenoiser(audioTrack);
        setLocalAudioTrack(audioTrack);
        tracksToPublish.push(audioTrack);
      }
      if (videoTrack) {
        createdVideoTrack = videoTrack;
        setLocalVideoTrack(videoTrack);
        tracksToPublish.push(videoTrack);
      }

      if (tracksToPublish.length > 0) {
        await clientRef.current.publish(tracksToPublish);
      }

      // Присутствие в комнате — не блокирует вход
      joinRoom(channel).catch(() => {});
      heartbeatRef.current = setInterval(heartbeat, 30000);

      toast.success(`Вы вошли в комнату: ${displayName}`);
    } catch (error) {
      console.error('[CallContext] Join call error:', error);
      
      // Clean up captured tracks to release microphone/camera and avoid duplicate sound
      if (createdAudioTrack) {
        try { createdAudioTrack.stop(); createdAudioTrack.close(); } catch (e) {}
      }
      if (createdVideoTrack) {
        try { createdVideoTrack.stop(); createdVideoTrack.close(); } catch (e) {}
      }
      if (clientRef.current) {
        try { await clientRef.current.leave(); } catch (e) {}
      }

      setLocalAudioTrack(null);
      setLocalVideoTrack(null);
      setRoomName('');
      setIsInCall(false);

      const errStr = String(error);
      if (errStr.includes('Permission denied') || errStr.includes('NotAllowedError') || error?.code === 'PERMISSION_DENIED') {
        toast.error('Ошибка доступа: Разрешите браузеру доступ к камере и микрофону.', { duration: 8000 });
      } else if (errStr.includes('NotFoundError') || errStr.includes('devices not found') || error?.code === 'DEVICE_NOT_FOUND') {
        toast.error('Камера или микрофон не обнаружены. Подключите их и попробуйте снова.', { duration: 8000 });
      } else {
        toast.error(`Ошибка входа в созвон: ${error?.message || 'Неизвестная ошибка'}`);
      }
    } finally {
      joiningRef.current = false;
      setIsJoining(false);
    }
  };

  // ─── Screen share ───────────────────────────────────────────────────────────
  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const result = await AgoraRTC.createScreenVideoTrack(
          {
            encoderConfig: {
              width: 1920,
              height: 1080,
              frameRate: 30,      // 15 → 30: плавное движение курсора и скролла
              bitrateMax: 3000,   // 1.5 → 3 Мбит: без «мыла» и подлагиваний на 1080p
            },
            optimizationMode: 'detail'
          },
          'disable'
        );
        const track = Array.isArray(result) ? result[0] : result;

        // h264 кодируется железом (GPU), а не процессором — меньше лагов на слабых ноутах
        const screenClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'h264' });
        screenClientRef.current = screenClient;

        const screenUid = `${uidRef.current}_screen`;
        await screenClient.join(APP_ID, channelRef.current, null, screenUid);
        await screenClient.publish(track);

        track.on('track-ended', () => stopScreenShare(track));
        setScreenTrack(track);
        setIsScreenSharing(true);
        toast.success('Демонстрация экрана началась');
      } catch (err) {
        console.error('[CallContext] Screen share error:', err);
        const errStr = String(err);
        if (errStr.includes('Permission denied') || errStr.includes('NotAllowedError')) {
          toast.error('Ошибка: Разрешите доступ к записи экрана в браузере или системных настройках.');
        } else {
          toast.error('Ошибка демонстрации экрана: ' + (err?.message || errStr));
        }
      }
    } else {
      stopScreenShare(screenTrack);
    }
  };

  const stopScreenShare = async (track) => {
    try {
      if (track) {
        track.stop();
        track.close();
      }
      if (screenClientRef.current) {
        await screenClientRef.current.leave();
        screenClientRef.current = null;
      }
    } catch (e) {
      console.error('[CallContext] stopScreenShare error:', e);
    }
    setScreenTrack(null);
    setIsScreenSharing(false);
  };

  // ─── Повторное подключение микрофона (вошли слушателем / браузер не дал доступ)
  const retryMic = async () => {
    if (!clientRef.current || !channelRef.current) return false;
    if (localAudioTrack) return true;
    try {
      const audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: 'speech_standard', AEC: true, ANS: true, AGC: true,
      });
      denoiserRef.current = await attachDenoiser(audioTrack);
      await clientRef.current.publish([audioTrack]);
      setLocalAudioTrack(audioTrack);
      toast.success('Микрофон подключён — теперь вас слышно');
      return true;
    } catch (e) {
      console.error('[CallContext] retryMic error:', e);
      const errStr = String(e);
      if (errStr.includes('NotAllowed') || errStr.includes('Permission denied') || e?.code === 'PERMISSION_DENIED') {
        toast.error('Браузер блокирует микрофон. Нажмите на замочек в адресной строке → Микрофон → Разрешить, затем попробуйте снова.', { duration: 9000 });
      } else if (errStr.includes('NotFound') || e?.code === 'DEVICE_NOT_FOUND') {
        toast.error('Микрофон не найден — проверьте, что он подключён и выбран в системе.', { duration: 8000 });
      } else if (errStr.includes('NotReadable') || errStr.includes('DEVICE_IN_USE')) {
        toast.error('Микрофон занят другой программой (Zoom, WhatsApp, диктофон). Закройте её и нажмите ещё раз.', { duration: 9000 });
      } else {
        toast.error('Не удалось подключить микрофон: ' + (e?.message || 'неизвестная ошибка'));
      }
      return false;
    }
  };

  // ─── Leave ──────────────────────────────────────────────────────────────────
  const leaveCall = async () => {
    if (leavingRef.current) return; // двойной клик по «Завершить»
    leavingRef.current = true;
    try {
      if (denoiserRef.current) {
        try { await denoiserRef.current.disable(); } catch (e) {}
        denoiserRef.current = null;
      }
      if (localAudioTrack) { localAudioTrack.stop(); localAudioTrack.close(); }
      if (localVideoTrack) { localVideoTrack.stop(); localVideoTrack.close(); }
      if (screenTrack)     { screenTrack.stop(); screenTrack.close(); }
      if (screenClientRef.current) {
        try { await screenClientRef.current.leave(); } catch (e) {}
        screenClientRef.current = null;
      }
      if (clientRef.current) await clientRef.current.leave();

      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
      if (channelRef.current) await leaveRoom(channelRef.current);
    } catch (e) {
      console.error('[CallContext] leaveCall error:', e);
    }

    setIsInCall(false);
    setIsScreenSharing(false);
    setRemoteUsers([]);
    setLocalVideoTrack(null);
    setLocalAudioTrack(null);
    setScreenTrack(null);
    channelRef.current = '';
    leavingRef.current = false;
  };

  // ─── Clean up on page unload ────────────────────────────────────────────────
  useEffect(() => {
    const handleUnload = () => {
      if (channelRef.current) leaveRoom(channelRef.current).catch(() => {});
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  return (
    <CallContext.Provider value={{
      isInCall, isJoining, isScreenSharing, roomName, remoteUsers,
      localVideoTrack, localAudioTrack, screenTrack, roomCounts,
      joinCall, leaveCall, toggleScreenShare, retryMic,
    }}>
      {children}
    </CallContext.Provider>
  );
};

export const useCall = () => useContext(CallContext);
