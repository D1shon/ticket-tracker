import React, { useEffect, useRef } from 'react';
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
  }, [track, style]);

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
    roomName
  } = useCall();

  const [size, setSize] = React.useState(1); // 1: S, 2: M, 3: L
  const [position, setPosition] = React.useState({
    x: window.innerWidth - 344,
    y: window.innerHeight - 300
  });
  const [isDragging, setIsDragging] = React.useState(false);
  const [isFullPage, setIsFullPage] = React.useState(true);
  const [isMicMuted, setIsMicMuted] = React.useState(false);
  const [isCameraMuted, setIsCameraMuted] = React.useState(false);

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

  // Active camera tracks for normal grid
  const activeCameras = [];
  if (!isCameraMuted && localVideoTrack) {
    activeCameras.push({ id: 'local', track: localVideoTrack, name: 'Я', isLocal: true });
  }
  remoteUsers.filter(u => !u.isScreen).forEach(u => {
    if (u.videoTrack) {
      activeCameras.push({ id: u.uid, track: u.videoTrack, name: 'Собеседник', isLocal: false });
    }
  });

  const gridColumns = activeCameras.length > 1 ? '1fr 1fr' : '1fr';

  const renderScreenShareLayout = () => {
    return (
      <div style={{
        position: 'relative',
        width: '100%',
        flex: isFullPage ? 1 : 'none',
        height: isFullPage ? 'auto' : (getWidth() * 9) / 16,
        background: '#000'
      }}>
        <VideoPlayer 
          track={activeScreenTrack} 
          style={{ objectFit: 'contain' }} 
        />
        
        {/* Floating thumbnail strip for camera streams */}
        <div style={{
          position: 'absolute',
          top: 16,
          right: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          zIndex: 100
        }}>
          {/* Local Camera Thumbnail */}
          {!isCameraMuted && localVideoTrack && (
            <div style={{
              width: isFullPage ? 160 : 100,
              height: isFullPage ? 120 : 75,
              borderRadius: 12,
              overflow: 'hidden',
              border: '2px solid rgba(255,255,255,0.2)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              background: '#1a1a20',
              position: 'relative'
            }}>
              <VideoPlayer track={localVideoTrack} />
              <div style={{
                position: 'absolute',
                bottom: 6,
                left: 6,
                background: 'rgba(0,0,0,0.6)',
                padding: '2px 6px',
                borderRadius: 4,
                fontSize: 9,
                color: 'white',
                fontWeight: 800
              }}>
                Я {isMicMuted ? '🔇' : '🎙️'}
              </div>
            </div>
          )}

          {/* Remote Camera Thumbnail */}
          {remoteUsers.filter(u => !u.isScreen).map(u => (
            <div key={u.uid} style={{
              width: isFullPage ? 160 : 100,
              height: isFullPage ? 120 : 75,
              borderRadius: 12,
              overflow: 'hidden',
              border: '2px solid rgba(255,255,255,0.2)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              background: '#1a1a20',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {u.videoTrack ? (
                <VideoPlayer track={u.videoTrack} />
              ) : (
                <User size={isFullPage ? 32 : 20} className="text-white/20" />
              )}
              <div style={{
                position: 'absolute',
                bottom: 6,
                left: 6,
                background: 'rgba(0,0,0,0.6)',
                padding: '2px 6px',
                borderRadius: 4,
                fontSize: 9,
                color: 'white',
                fontWeight: 800
              }}>
                Собеседник {u.audioTrack ? '🔊' : '🔇'}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderNormalGrid = () => {
    if (activeCameras.length === 0) {
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
        minHeight: isFullPage ? 'auto' : (getWidth() / activeCameras.length) * 0.75
      }}>
        {activeCameras.map(cam => (
          <div key={cam.id} style={{
            position: 'relative',
            background: '#1a1a20',
            height: isFullPage ? '100%' : 'auto',
            aspectRatio: isFullPage ? 'auto' : '4/3',
            width: '100%'
          }}>
            <VideoPlayer track={cam.track} />
            <div style={{
              position: 'absolute',
              bottom: 12,
              left: 12,
              background: 'rgba(0,0,0,0.5)',
              padding: '4px 8px',
              borderRadius: 6,
              fontSize: 10,
              color: 'white',
              fontWeight: 800,
              zIndex: 10
            }}>
              {cam.name} {cam.isLocal ? (isMicMuted ? '🔇' : '🎙️') : (remoteUsers[0]?.audioTrack ? '🔊' : '🔇')}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
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
          padding: isFullPage ? '16px 24px' : '12px 16px',
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
            background: '#22c55e',
            borderRadius: '50%',
            boxShadow: '0 0 12px #22c55e'
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
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isFullPage ? (
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

          <button
            onClick={(e) => { e.stopPropagation(); leaveCall(); }}
            style={{
              background: '#ef4444',
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
              fontWeight: 800
            }}
          >
            <PhoneOff size={14} />
            {isFullPage && <span>Завершить</span>}
          </button>
        </div>
      </div>

      {/* ── Content View ── */}
      {hasActiveScreenShare ? renderScreenShareLayout() : renderNormalGrid()}

      {/* ── Bottom Controls ── */}
      <div style={{
        padding: isFullPage ? '16px 24px' : 12,
        display: 'flex',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.2)',
        borderTop: isFullPage ? '1px solid rgba(255,255,255,0.05)' : 'none',
        gap: 12
      }}>
        {/* Toggle Mic */}
        <button
          onClick={toggleMic}
          style={{
            flex: isFullPage ? 'none' : 1,
            width: isFullPage ? 56 : undefined,
            height: 44,
            background: isMicMuted ? '#ef4444' : 'rgba(255,255,255,0.05)',
            border: 'none',
            borderRadius: 12,
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          title={isMicMuted ? "Включить микрофон" : "Выключить микрофон"}
        >
          {isMicMuted ? <MicOff size={18} /> : <Mic size={18} />}
        </button>

        {/* Toggle Camera */}
        <button
          onClick={toggleCamera}
          style={{
            flex: isFullPage ? 'none' : 1,
            width: isFullPage ? 56 : undefined,
            height: 44,
            background: isCameraMuted ? '#ef4444' : 'rgba(255,255,255,0.05)',
            border: 'none',
            borderRadius: 12,
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          title={isCameraMuted ? "Включить камеру" : "Выключить камеру"}
        >
          {isCameraMuted ? <VideoOff size={18} /> : <Video size={18} />}
        </button>

        {/* Screen Share */}
        <button
          onClick={toggleScreenShare}
          style={{
            width: isFullPage ? 'auto' : '100%',
            minWidth: isFullPage ? 220 : undefined,
            flex: isFullPage ? 'none' : 2,
            background: isScreenSharing ? '#3b82f6' : 'rgba(255,255,255,0.05)',
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
      </div>
    </div>
  );
};

export default CallOverlay;
