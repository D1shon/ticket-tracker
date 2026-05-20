import React, { useEffect, useRef } from 'react';
import { useCall } from '../../store/CallContext';
import { PhoneOff, Monitor, Maximize2, Minimize2, User } from 'lucide-react';

const CallOverlay = () => {
  const { isInCall, isScreenSharing, remoteUsers, localVideoTrack, screenTrack, leaveCall, toggleScreenShare, roomName } = useCall();
  const [size, setSize] = React.useState(1); // 1: Small, 2: Medium, 3: Large
  const [position, setPosition] = React.useState({ x: window.innerWidth - 344, y: window.innerHeight - 300 });
  const [isDragging, setIsDragging] = React.useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  
  const localRef = useRef(null);
  const remoteRef = useRef(null);

  // Local video/screen track rendering
  useEffect(() => {
    const track = isScreenSharing ? screenTrack : localVideoTrack;
    const container = localRef.current;
    if (track && container) {
      container.innerHTML = '';
      try {
        track.play(container);
      } catch (err) {
        console.error("[CallOverlay] Error playing local track:", err);
      }
      return () => {
        try {
          track.stop();
        } catch (e) {}
      };
    }
  }, [localVideoTrack, screenTrack, isScreenSharing, isInCall, size]);

  // Remote video rendering
  const remoteVideoTrack = remoteUsers[0]?.videoTrack;
  useEffect(() => {
    const container = remoteRef.current;
    if (remoteVideoTrack && container) {
      container.innerHTML = '';
      try {
        remoteVideoTrack.play(container);
      } catch (err) {
        console.error("[CallOverlay] Error playing remote track:", err);
      }
      return () => {
        try {
          remoteVideoTrack.stop();
        } catch (e) {}
      };
    }
  }, [remoteVideoTrack, size]);

  // Handle dragging
  const handleMouseDown = (e) => {
    setIsDragging(true);
    dragStartPos.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragStartPos.current.x,
        y: e.clientY - dragStartPos.current.y
      });
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!isInCall) return null;

  const getWidth = () => {
    if (size === 1) return 340;
    if (size === 2) return 560;
    return 800;
  };

  const cycleSize = () => {
    setSize(prev => (prev === 3 ? 1 : prev + 1));
  };

  const remoteUser = remoteUsers[0];
  const hasRemoteVideo = !!remoteUser?.videoTrack;
  const hasRemoteAudio = !!remoteUser?.audioTrack;
  const hasRemote = remoteUsers.length > 0;

  return (
    <div style={{
      position: 'fixed',
      left: position.x,
      top: position.y,
      zIndex: 2000,
      width: getWidth(),
      background: '#111115',
      borderRadius: 24,
      boxShadow: '0 30px 60px rgba(0,0,0,0.7)',
      border: '1px solid rgba(255,255,255,0.12)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      transition: isDragging ? 'none' : 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      cursor: isDragging ? 'grabbing' : 'default'
    }}>
      {/* Header / Drag Handle */}
      <div 
        onMouseDown={handleMouseDown}
        style={{ 
          padding: '12px 16px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          background: 'rgba(255,255,255,0.03)', 
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          cursor: 'grab',
          userSelect: 'none'
        }}
      >
         <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 8, height: 8, background: '#22c55e', borderRadius: '50%', boxShadow: '0 0 12px #22c55e' }} />
            <span style={{ fontSize: 11, fontWeight: 900, color: 'white', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{roomName}</span>
         </div>
         <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button 
              onClick={(e) => { e.stopPropagation(); cycleSize(); }}
              style={{ background: 'rgba(255,255,255,0.08)', border: 'none', padding: '6px 12px', borderRadius: 10, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
               {size === 3 ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
               <span style={{ fontSize: 10, fontWeight: 800 }}>{size === 1 ? 'M' : size === 2 ? 'L' : 'S'}</span>
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); leaveCall(); }} 
              style={{ background: '#ef4444', border: 'none', padding: '6px', borderRadius: 8, color: 'white', cursor: 'pointer' }}
            >
               <PhoneOff size={14} />
            </button>
         </div>
      </div>

      {/* Videos Grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: hasRemote ? '1fr 1fr' : '1fr', 
        gap: 2, 
        background: '#000',
        minHeight: (getWidth() / (hasRemote ? 2 : 1)) * 0.75 
      }}>
         {/* Local Video */}
         <div style={{ position: 'relative', background: '#1a1a20', aspectRatio: '4/3' }}>
            <div ref={localRef} style={{ width: '100%', height: '100%' }} />
            <div style={{ position: 'absolute', bottom: 12, left: 12, background: 'rgba(0,0,0,0.5)', padding: '4px 8px', borderRadius: 6, fontSize: 10, color: 'white', fontWeight: 800 }}>Вы</div>
         </div>

         {/* Remote Video */}
         {hasRemote ? (
           <div style={{ position: 'relative', background: '#1a1a20', aspectRatio: '4/3' }}>
              {hasRemoteVideo ? (
                <div ref={remoteRef} style={{ width: '100%', height: '100%' }} />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.15)', width: '100%', height: '100%' }}>
                   <User size={size === 1 ? 40 : 80} strokeWidth={1} />
                   <span style={{ fontSize: 10, fontWeight: 800, marginTop: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Камера выключена</span>
                </div>
              )}
              <div style={{ position: 'absolute', bottom: 12, left: 12, background: 'rgba(0,0,0,0.5)', padding: '4px 8px', borderRadius: 6, fontSize: 10, color: 'white', fontWeight: 800 }}>
                 Собеседник {hasRemoteAudio ? '🎤' : '🔇'}
              </div>
           </div>
         ) : !isScreenSharing && (
           <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.15)', aspectRatio: '4/3' }}>
              <User size={size === 1 ? 40 : 80} strokeWidth={1} />
              <span style={{ fontSize: 10, fontWeight: 800, marginTop: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Ожидание...</span>
           </div>
         )}
      </div>

      {/* Bottom Controls */}
      <div style={{ padding: 12, display: 'flex', gap: 8, background: 'rgba(0,0,0,0.2)' }}>
         <button 
           onClick={toggleScreenShare}
           style={{ 
             flex: 1, 
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
            <Monitor size={15} /> {isScreenSharing ? 'Выкл. экран' : 'Демонстрация'}
         </button>
      </div>
    </div>
  );
};

export default CallOverlay;
