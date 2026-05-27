import React, { useEffect, useRef } from 'react';
import { useCall } from '../../store/CallContext';
import { PhoneOff, Monitor, Maximize2, Minimize2, User } from 'lucide-react';

const CallOverlay = () => {
  const {
    isInCall,
    isScreenSharing,
    remoteUsers,
    localVideoTrack,
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
  const dragStartPos = useRef({ x: 0, y: 0 });
  const localRef = useRef(null);
  const remoteRef = useRef(null);

  // Reset to full-page when a new call starts
  useEffect(() => {
    if (isInCall) setIsFullPage(true);
  }, [isInCall]);

  // Local video / screen track
  useEffect(() => {
    const track = isScreenSharing ? screenTrack : localVideoTrack;
    const container = localRef.current;
    if (track && container) {
      container.innerHTML = '';
      try { track.play(container); } catch (err) { console.error('[CallOverlay] local track error:', err); }
      return () => { try { track.stop(); } catch (_) {} };
    }
  }, [localVideoTrack, screenTrack, isScreenSharing, isInCall, size, isFullPage]);

  // Remote video track
  const remoteVideoTrack = remoteUsers[0]?.videoTrack;
  useEffect(() => {
    const container = remoteRef.current;
    if (remoteVideoTrack && container) {
      container.innerHTML = '';
      try { remoteVideoTrack.play(container); } catch (err) { console.error('[CallOverlay] remote track error:', err); }
      return () => { try { remoteVideoTrack.stop(); } catch (_) {} };
    }
  }, [remoteVideoTrack, size, isFullPage]);

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

  if (!isInCall) return null;

  const getWidth = () => size === 1 ? 340 : size === 2 ? 560 : 800;
  const cycleSize = () => setSize(prev => prev === 3 ? 1 : prev + 1);

  const remoteUser = remoteUsers[0];
  const hasRemoteVideo = !!remoteUser?.videoTrack;
  const hasRemoteAudio = !!remoteUser?.audioTrack;
  const hasRemote = remoteUsers.length > 0;

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

      {/* ── Video Grid ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: hasRemote ? '1fr 1fr' : '1fr',
        gap: 2,
        background: '#000',
        flex: isFullPage ? 1 : 'none',
        minHeight: isFullPage ? 'auto' : (getWidth() / (hasRemote ? 2 : 1)) * 0.75
      }}>
        {/* Local stream */}
        <div style={{
          position: 'relative',
          background: '#1a1a20',
          height: isFullPage ? '100%' : 'auto',
          aspectRatio: isFullPage ? 'auto' : '4/3',
          width: '100%'
        }}>
          <div ref={localRef} style={{ width: '100%', height: '100%' }} />
          <div style={{
            position: 'absolute', bottom: 12, left: 12,
            background: 'rgba(0,0,0,0.5)',
            padding: '4px 8px', borderRadius: 6,
            fontSize: 10, color: 'white', fontWeight: 800
          }}>
            Я
          </div>
        </div>

        {/* Remote stream */}
        {hasRemote ? (
          <div style={{
            position: 'relative',
            background: '#1a1a20',
            height: isFullPage ? '100%' : 'auto',
            aspectRatio: isFullPage ? 'auto' : '4/3',
            width: '100%'
          }}>
            {hasRemoteVideo ? (
              <div ref={remoteRef} style={{ width: '100%', height: '100%' }} />
            ) : (
              <div style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                color: 'rgba(255,255,255,0.15)',
                width: '100%', height: '100%'
              }}>
                <User size={size === 1 ? 40 : 80} strokeWidth={1} />
                <span style={{ fontSize: 10, fontWeight: 800, marginTop: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Камера отключена
                </span>
              </div>
            )}
            <div style={{
              position: 'absolute', bottom: 12, left: 12,
              background: 'rgba(0,0,0,0.5)',
              padding: '4px 8px', borderRadius: 6,
              fontSize: 10, color: 'white', fontWeight: 800
            }}>
              Собеседник {hasRemoteAudio ? '\uD83D\uDD0A' : '\uD83D\uDD07'}
            </div>
          </div>
        ) : !isScreenSharing && (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.15)',
            height: isFullPage ? '100%' : 'auto',
            aspectRatio: isFullPage ? 'auto' : '4/3',
            width: '100%'
          }}>
            <User size={size === 1 ? 40 : 80} strokeWidth={1} />
            <span style={{ fontSize: 10, fontWeight: 800, marginTop: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Ожидание...
            </span>
          </div>
        )}
      </div>

      {/* ── Bottom Controls ── */}
      <div style={{
        padding: isFullPage ? '16px 24px' : 12,
        display: 'flex',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.2)',
        borderTop: isFullPage ? '1px solid rgba(255,255,255,0.05)' : 'none'
      }}>
        <button
          onClick={toggleScreenShare}
          style={{
            width: isFullPage ? 'auto' : '100%',
            minWidth: isFullPage ? 220 : undefined,
            flex: isFullPage ? 'none' : 1,
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
