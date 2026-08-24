import React, { useEffect, useRef } from 'react';
import { isMobileDevice } from '../../lib/isMobile';
import { useCall } from '../../store/CallContext';
import { PhoneOff, Monitor, Maximize2, Minimize2, User, Mic, MicOff, Video, VideoOff, X } from 'lucide-react';
import { toast } from 'sonner';

// Self-contained VideoPlayer component to ensure Agora tracks play correctly
// and apply object-fit scaling (contain for screen share, cover for camera)
const VideoPlayer = ({ track, style, className }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (track && container) {
      container.innerHTML = '';
      try {
        track.play(container);
        const applyStyle = () => {
          const video = container.querySelector('video');
          if (video) {
            video.style.objectFit = style?.objectFit || 'cover';
            video.style.width = '100%';
            video.style.height = '100%';
          }
        };
        applyStyle();
        const timer = setTimeout(applyStyle, 100);
        return () => clearTimeout(timer);
      } catch (err) {
        console.error('[VideoPlayer] play track error:', err);
      }
      return () => {
        try {
          track.stop();
        } catch (_) {}
      };
    }
  }, [track, style?.objectFit]);

  return <div ref={containerRef} className={className} style={{ width: '100%', height: '100%', overflow: 'hidden', ...style }} />;
};

const CallOverlay = () => {
  const {
    isInCall,
    isScreenSharing,
    remoteUsers,
    localVideoTrack,
    localAudioTrack,
    screenTrack,
    leaveCall,
    toggleScreenShare,
    retryMic,
    roomName
  } = useCall();
  const [isRetryingMic, setIsRetryingMic] = React.useState(false);

  const [size, setSize] = React.useState(1); // 1: S, 2: M, 3: L
  const [position, setPosition] = React.useState({
    x: window.innerWidth - 344,
    y: window.innerHeight - 300
  });
  const [isDragging, setIsDragging] = React.useState(false);
  const [isFullPage, setIsFullPage] = React.useState(true);
  const [isMicMuted, setIsMicMuted] = React.useState(false);
  const [isCameraMuted, setIsCameraMuted] = React.useState(false);
  const [isLeaving, setIsLeaving] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(() => isMobileDevice());

  useEffect(() => {
    const h = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  // Одно нажатие завершает звонок; повторные — игнорируются
  const handleLeave = async () => {
    if (isLeaving) return;
    setIsLeaving(true);
    try { await leaveCall(); } finally { setIsLeaving(false); }
  };

  const dragStartPos = useRef({ x: 0, y: 0 });

  // Reset to full-page when a new call starts
  useEffect(() => {
    if (isInCall) {
      setIsFullPage(true);
      setIsMicMuted(false);
      setIsCameraMuted(false);
    }
  }, [isInCall]);

  // Drag logic (floating mode only)
  const handleMouseDown = (e) => {
    if (isFullPage) return;
    setIsDragging(true);
    dragStartPos.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!isDragging) return;
      setPosition({ x: e.clientX - dragStartPos.current.x, y: e.clientY - dragStartPos.current.y });
    };
    const onUp = () => setIsDragging(false);
    if (isDragging) {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging]);

  // Поведение как в WhatsApp:
  // — Я транслирую экран → созвон сворачивается в плавающее окно (работаю со своим экраном)
  // — Кто-то другой транслирует → разворачиваем на весь экран, чтобы смотреть
  useEffect(() => {
    const remoteShare = remoteUsers.find(u => u.isScreen && u.videoTrack);
    if (isScreenSharing) {
      setIsFullPage(false);
      // окно — в правый нижний угол, не мешает работать
      setPosition({ x: Math.max(12, window.innerWidth - 356), y: Math.max(12, window.innerHeight - 320) });
    } else if (remoteShare) {
      setIsFullPage(true);
    }
  }, [isScreenSharing, remoteUsers]);

  const toggleMic = async () => {
    if (localAudioTrack) {
      try {
        const nextState = !isMicMuted;
        await localAudioTrack.setEnabled(!nextState);
        setIsMicMuted(nextState);
        toast.success(nextState ? 'Микрофон выключен' : 'Микрофон включен');
      } catch (err) {
        console.error('Toggle mic error:', err);
      }
    } else {
      toast.error('Микрофон недоступен');
    }
  };

  const toggleCamera = async () => {
    if (localVideoTrack) {
      try {
        const nextState = !isCameraMuted;
        await localVideoTrack.setEnabled(!nextState);
        setIsCameraMuted(nextState);
        toast.success(nextState ? 'Камера выключена' : 'Камера включена');
      } catch (err) {
        console.error('Toggle camera error:', err);
      }
    } else {
      toast.error('Камера недоступна');
    }
  };

  if (!isInCall) return null;

  const getWidth = () => size === 1 ? 340 : size === 2 ? 560 : 800;
  const cycleSize = () => setSize(prev => prev === 3 ? 1 : prev + 1);

  // Screen share tracks check
  const activeScreenShareUser = remoteUsers.find(u => u.isScreen && u.videoTrack);
  const activeScreenTrack = isScreenSharing ? screenTrack : (activeScreenShareUser ? activeScreenShareUser.videoTrack : null);
  const hasActiveScreenShare = !!activeScreenTrack;

  // Все участники (плитка каждому — с камерой видео, без камеры аватар),
  // чтобы всегда было видно, кто в созвоне
  const participants = [
    { id: 'local', track: isCameraMuted ? null : localVideoTrack, name: 'Я', isLocal: true, muted: isMicMuted },
    ...remoteUsers.filter(u => !u.isScreen).map(u => ({
      id: u.uid, track: u.videoTrack, name: 'Собеседник', isLocal: false, muted: !u.audioTrack,
    })),
  ];
  const participantCount = participants.length;
  const activeCameras = participants; // рендерим всех, даже без видео

  const gridColumns = activeCameras.length > 1 ? '1fr 1fr' : '1fr';

  const thumbW = isFullPage ? 180 : 110;
  const thumbH = isFullPage ? 135 : 82;

  const renderScreenShareLayout = () => {
    // If I'm the one sharing — show remote cameras as main content, not my own screen
    if (isScreenSharing && !activeScreenShareUser) {
      return (
        <div style={{
          position: 'relative', width: '100%', background: '#000',
          flex: isFullPage ? 1 : 'none',
          height: isFullPage ? '100%' : (getWidth() * 9) / 16,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16
        }}>
          <div style={{
            position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(85,128,168,0.15)', border: '1px solid rgba(85,128,168,0.4)',
            borderRadius: 20, padding: '6px 16px',
            fontSize: 11, fontWeight: 800, color: '#60a5fa', letterSpacing: '0.05em'
          }}>
            ● ТРАНСЛЯЦИЯ ЭКРАНА АКТИВНА
          </div>
          {/* Remote camera grid while sharing */}
          {remoteUsers.filter(u => !u.isScreen).length > 0 ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: remoteUsers.filter(u => !u.isScreen).length > 1 ? '1fr 1fr' : '1fr',
              gap: 8, padding: '60px 16px 16px', width: '100%', height: '100%'
            }}>
              {!isCameraMuted && localVideoTrack && (
                <div style={{ position: 'relative', background: '#1a1a20', borderRadius: 12, overflow: 'hidden', minHeight: 200 }}>
                  <VideoPlayer track={localVideoTrack} />
                  <div style={{ position: 'absolute', bottom: 8, left: 8, background: 'rgba(0,0,0,0.6)', padding: '2px 8px', borderRadius: 4, fontSize: 9, color: 'white', fontWeight: 800 }}>
                    Я {isMicMuted ? '🔇' : '🎙️'}
                  </div>
                </div>
              )}
              {remoteUsers.filter(u => !u.isScreen).map(u => (
                <div key={u.uid} style={{ position: 'relative', background: '#1a1a20', borderRadius: 12, overflow: 'hidden', minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {u.videoTrack ? <VideoPlayer track={u.videoTrack} /> : <User size={48} color="rgba(255,255,255,0.15)" />}
                  <div style={{ position: 'absolute', bottom: 8, left: 8, background: 'rgba(0,0,0,0.6)', padding: '2px 8px', borderRadius: 4, fontSize: 9, color: 'white', fontWeight: 800 }}>
                    Собеседник {u.audioTrack ? '🔊' : '🔇'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)' }}>
              <Monitor size={48} style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 12, fontWeight: 700 }}>Ожидание участников...</div>
            </div>
          )}
        </div>
      );
    }

    // Viewer: screen share as main, cameras as PiP thumbnails
    return (
      <div style={{
        position: 'relative', width: '100%',
        flex: isFullPage ? 1 : 'none',
        height: isFullPage ? '100%' : (getWidth() * 9) / 16,
        background: '#000'
      }}>
        <VideoPlayer track={activeScreenTrack} style={{ objectFit: 'contain' }} />

        {/* PiP thumbnail strip */}
        <div style={{
          position: 'absolute', bottom: 16, right: 16,
          display: 'flex', flexDirection: 'column', gap: 10, zIndex: 100
        }}>
          {!isCameraMuted && localVideoTrack && (
            <div style={{
              width: thumbW, height: thumbH, borderRadius: 12, overflow: 'hidden',
              border: '2px solid rgba(255,255,255,0.25)', boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
              background: '#1a1a20', position: 'relative'
            }}>
              <VideoPlayer track={localVideoTrack} />
              <div style={{ position: 'absolute', bottom: 5, left: 6, background: 'rgba(0,0,0,0.65)', padding: '2px 6px', borderRadius: 4, fontSize: 9, color: 'white', fontWeight: 800 }}>
                Я {isMicMuted ? '🔇' : '🎙️'}
              </div>
            </div>
          )}
          {remoteUsers.filter(u => !u.isScreen).map(u => (
            <div key={u.uid} style={{
              width: thumbW, height: thumbH, borderRadius: 12, overflow: 'hidden',
              border: '2px solid rgba(255,255,255,0.25)', boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
              background: '#1a1a20', position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              {u.videoTrack ? <VideoPlayer track={u.videoTrack} /> : <User size={isFullPage ? 36 : 22} color="rgba(255,255,255,0.15)" />}
              <div style={{ position: 'absolute', bottom: 5, left: 6, background: 'rgba(0,0,0,0.65)', padding: '2px 6px', borderRadius: 4, fontSize: 9, color: 'white', fontWeight: 800 }}>
                Собеседник {u.audioTrack ? '🔊' : '🔇'}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderNormalGrid = () => {
    if (activeCameras.length === 0) {  // теоретически недостижимо — «Я» всегда есть
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.15)',
          height: '100%',
          width: '100%',
          minHeight: isFullPage ? 'auto' : 240,
          background: '#000',
          flex: isFullPage ? 1 : 'none'
        }}>
          <User size={80} strokeWidth={1} />
          <span style={{ fontSize: 10, fontWeight: 800, marginTop: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Все камеры отключены
          </span>
        </div>
      );
    }

    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: gridColumns,
        gap: 2,
        background: '#000',
        flex: isFullPage ? 1 : 'none',
        height: isFullPage ? '100%' : (getWidth() / activeCameras.length) * 0.75
      }}>
        {activeCameras.map(cam => (
          <div key={cam.id} style={{
            position: 'relative',
            background: '#1a1a20',
            height: '100%',
            width: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minHeight: isFullPage ? 'auto' : 160,
          }}>
            {cam.track
              ? <VideoPlayer track={cam.track} />
              : (
                // Камера выключена — показываем аватар, чтобы участник был виден
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.3)' }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <User size={32} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700 }}>Камера выключена</span>
                </div>
              )}
            <div style={{
              position: 'absolute', bottom: 12, left: 12,
              background: 'rgba(0,0,0,0.55)', padding: '4px 8px', borderRadius: 6,
              fontSize: 10, color: 'white', fontWeight: 800, zIndex: 10,
            }}>
              {cam.name} {cam.muted ? '🔇' : '🎙️'}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
    {/* ── Индикатор трансляции: пульсирующая рамка по краям монитора ── */}
    {isScreenSharing && (
      <>
        <style>{`
          @keyframes hjSharePulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.35; }
          }
        `}</style>
        <div style={{
          position: 'fixed', inset: 0, zIndex: 2500, pointerEvents: 'none',
          border: '4px solid #5580A8',
          boxShadow: 'inset 0 0 32px rgba(85,128,168,0.35)',
          animation: 'hjSharePulse 2.2s ease-in-out infinite',
        }} />
        <div style={{
          position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 2600,
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(15,18,25,0.92)', border: '1px solid rgba(85,128,168,0.5)',
          borderRadius: 24, padding: '7px 8px 7px 16px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#5580A8', boxShadow: '0 0 10px #5580A8', animation: 'hjSharePulse 1.4s infinite', flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap' }}>
            Вы транслируете экран
          </span>
          <button
            onClick={toggleScreenShare}
            style={{
              background: '#B06A6A', border: 'none', borderRadius: 18, padding: '6px 14px',
              color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            Остановить
          </button>
        </div>
      </>
    )}

    <div style={{
      position: 'fixed',
      left: isFullPage ? 0 : position.x,
      top: isFullPage ? 0 : position.y,
      zIndex: 2000,
      width: isFullPage ? '100vw' : getWidth(),
      height: isFullPage ? '100vh' : 'auto',
      background: '#09090b',
      borderRadius: isFullPage ? 0 : 24,
      boxShadow: isFullPage ? 'none' : '0 30px 60px rgba(0,0,0,0.7)',
      border: isFullPage ? 'none' : '1px solid rgba(255,255,255,0.12)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      transition: isDragging
        ? 'none'
        : 'width 0.3s cubic-bezier(0.4,0,0.2,1), height 0.3s cubic-bezier(0.4,0,0.2,1)',
      cursor: isDragging ? 'grabbing' : 'default'
    }}>

      {/* ── Header / Drag Handle ── */}
      <div
        onMouseDown={isFullPage ? null : handleMouseDown}
        style={{
          padding: isMobile
            ? 'calc(12px + env(safe-area-inset-top)) 16px 12px'
            : (isFullPage ? '16px 24px' : '12px 16px'),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255,255,255,0.03)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          cursor: isFullPage ? 'default' : 'grab',
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 8, height: 8,
            background: '#5F9C81',
            borderRadius: '50%',
            boxShadow: '0 0 12px #5F9C81'
          }} />
          <span style={{
            fontSize: isFullPage ? 13 : 11,
            fontWeight: 900,
            color: 'white',
            textTransform: 'uppercase',
            letterSpacing: '0.08em'
          }}>
            {roomName}
          </span>
          <span style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.75)',
            background: 'rgba(255,255,255,0.08)', padding: '3px 9px', borderRadius: 20,
          }} title="Участников в созвоне">
            <User size={11} /> {participantCount}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* На телефоне окно всегда на весь экран, «Свернуть» не показываем */}
          {isFullPage ? (
            !isMobile && (
              <button
                onClick={(e) => { e.stopPropagation(); setIsFullPage(false); }}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: 10,
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 10,
                  fontWeight: 800,
                  transition: 'all 0.2s'
                }}
              >
                <Minimize2 size={14} />
                <span>Свернуть</span>
              </button>
            )
          ) : (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setIsFullPage(true); }}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: 10,
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Maximize2 size={14} />
                <span style={{ fontSize: 10, fontWeight: 800 }}>На весь экран</span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); cycleSize(); }}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: 10,
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: 10,
                  fontWeight: 800
                }}
              >
                Размер: {size === 1 ? 'S' : size === 2 ? 'M' : 'L'}
              </button>
            </>
          )}

          {/* На телефоне «Завершить» живёт внизу, под большим пальцем */}
          {!isMobile && (
            <button
              onClick={(e) => { e.stopPropagation(); handleLeave(); }}
              disabled={isLeaving}
              style={{
                background: '#B06A6A',
                border: 'none',
                padding: isFullPage ? '8px 16px' : '6px',
                borderRadius: isFullPage ? 10 : 8,
                color: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                fontSize: 10,
                fontWeight: 800,
                opacity: isLeaving ? 0.6 : 1
              }}
            >
              <PhoneOff size={14} />
              {isFullPage && <span>{isLeaving ? 'Выходим…' : 'Завершить'}</span>}
            </button>
          )}
        </div>
      </div>

      {/* ── Content View ── */}
      {hasActiveScreenShare ? renderScreenShareLayout() : renderNormalGrid()}

      {/* ── «Вас не слышно»: вошли без микрофона (нет доступа / устройство занято) ── */}
      {!localAudioTrack && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap',
          padding: '10px 14px', background: 'rgba(176,106,106,0.14)', borderTop: '1px solid rgba(176,106,106,0.35)',
        }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: '#fca5a5' }}>
            🎤 Вас не слышно — микрофон не подключён
          </span>
          <button
            onClick={async () => { setIsRetryingMic(true); try { await retryMic(); } finally { setIsRetryingMic(false); } }}
            disabled={isRetryingMic}
            style={{
              padding: '8px 16px', borderRadius: 10, border: 'none', background: '#B06A6A', color: '#fff',
              fontSize: 12, fontWeight: 900, cursor: 'pointer', opacity: isRetryingMic ? 0.6 : 1,
            }}
          >
            {isRetryingMic ? 'Подключаем…' : 'Подключить микрофон'}
          </button>
        </div>
      )}

      {/* ── Bottom Controls ── */}
      <div style={{
        padding: isMobile
          ? '14px 16px calc(14px + env(safe-area-inset-bottom))'
          : (isFullPage ? '16px 24px' : 12),
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'stretch',
        background: 'rgba(0,0,0,0.2)',
        borderTop: isFullPage ? '1px solid rgba(255,255,255,0.05)' : 'none',
        gap: 12
      }}>
        {/* Toggle Mic */}
        <button
          onClick={toggleMic}
          style={{
            flex: (isFullPage && !isMobile) ? 'none' : 1,
            width: (isFullPage && !isMobile) ? 56 : undefined,
            height: isMobile ? 56 : 44,
            background: isMicMuted ? '#B06A6A' : 'rgba(255,255,255,0.08)',
            border: 'none',
            borderRadius: 14,
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          title={isMicMuted ? "Включить микрофон" : "Выключить микрофон"}
        >
          {isMicMuted ? <MicOff size={isMobile ? 22 : 18} /> : <Mic size={isMobile ? 22 : 18} />}
        </button>

        {/* Toggle Camera */}
        <button
          onClick={toggleCamera}
          style={{
            flex: (isFullPage && !isMobile) ? 'none' : 1,
            width: (isFullPage && !isMobile) ? 56 : undefined,
            height: isMobile ? 56 : 44,
            background: isCameraMuted ? '#B06A6A' : 'rgba(255,255,255,0.08)',
            border: 'none',
            borderRadius: 14,
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          title={isCameraMuted ? "Включить камеру" : "Выключить камеру"}
        >
          {isCameraMuted ? <VideoOff size={isMobile ? 22 : 18} /> : <Video size={isMobile ? 22 : 18} />}
        </button>

        {/* Screen Share — на телефонах браузеры не поддерживают, прячем */}
        {!isMobile && (
          <button
            onClick={toggleScreenShare}
            style={{
              width: isFullPage ? 'auto' : '100%',
              minWidth: isFullPage ? 220 : undefined,
              flex: isFullPage ? 'none' : 2,
              background: isScreenSharing ? '#5580A8' : 'rgba(255,255,255,0.05)',
              border: 'none',
              padding: '12px',
              borderRadius: 12,
              color: 'white',
              fontSize: 11,
              fontWeight: 900,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}
          >
            <Monitor size={15} />
            {isScreenSharing ? 'Откл. экран' : 'Трансляция экрана'}
          </button>
        )}

        {/* Завершить — на телефоне большая красная кнопка внизу */}
        {isMobile && (
          <button
            onClick={handleLeave}
            disabled={isLeaving}
            style={{
              flex: 2,
              height: 56,
              background: '#B06A6A',
              border: 'none',
              borderRadius: 14,
              color: 'white',
              fontSize: 13,
              fontWeight: 900,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              opacity: isLeaving ? 0.6 : 1,
              boxShadow: '0 4px 16px rgba(176,106,106,0.4)'
            }}
          >
            <PhoneOff size={20} />
            {isLeaving ? 'Выходим…' : 'Завершить'}
          </button>
        )}
      </div>
    </div>
    </>
  );
};

export default CallOverlay;
