import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { toast } from 'sonner';

const CallContext = createContext();

const APP_ID = 'bb4329d6bc93488596e037c5ad1a96c9';

export const CallProvider = ({ children }) => {
  const [isInCall, setIsInCall] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [remoteUsers, setRemoteUsers] = useState([]);
  const [localVideoTrack, setLocalVideoTrack] = useState(null);
  const [localAudioTrack, setLocalAudioTrack] = useState(null);
  const [screenTrack, setScreenTrack] = useState(null);

  const clientRef = useRef(null);

  const joinCall = async (displayName) => {
    try {
      const agoraChannel = displayName === 'Зал переговоров' ? 'main_room' : 
                          displayName === 'HR Отдел' ? 'hr_room' : 
                          `custom_${Math.random().toString(36).substring(7)}`;
      
      setRoomName(displayName);
      clientRef.current = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

      clientRef.current.on('user-published', async (user, mediaType) => {
        await clientRef.current.subscribe(user, mediaType);
        if (mediaType === 'video') setRemoteUsers(prev => [...prev.filter(u => u.uid !== user.uid), user]);
        if (mediaType === 'audio') user.audioTrack.play();
      });

      clientRef.current.on('user-unpublished', (user) => {
        setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid));
      });

      await clientRef.current.join(APP_ID, agoraChannel, null, null);

      const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(
        { encoderConfig: "high_quality_stereo", AEC: true, ANS: true, AGC: true },
        { encoderConfig: { width: 1280, height: 720, frameRate: 30 } }
      );

      setLocalAudioTrack(audioTrack);
      setLocalVideoTrack(videoTrack);
      await clientRef.current.publish([audioTrack, videoTrack]);
      
      setIsInCall(true);
      toast.success(`Вы вошли в комнату: ${displayName}`);
    } catch (error) {
      console.error(error);
      toast.error('Ошибка входа в созвон');
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const track = await AgoraRTC.createScreenVideoTrack({ encoderConfig: "1080p_1" }, "auto");
        setScreenTrack(track);
        
        await clientRef.current.unpublish(localVideoTrack);
        await clientRef.current.publish(track);
        
        track.on('track-ended', () => stopScreenShare(track));
        setIsScreenSharing(true);
      } catch (err) {
        toast.error('Ошибка демонстрации экрана');
      }
    } else {
      stopScreenShare(screenTrack);
    }
  };

  const stopScreenShare = async (track) => {
    if (track) {
      await clientRef.current.unpublish(track);
      track.stop();
      track.close();
    }
    await clientRef.current.publish(localVideoTrack);
    setScreenTrack(null);
    setIsScreenSharing(false);
  };

  const leaveCall = async () => {
    if (localAudioTrack) { localAudioTrack.stop(); localAudioTrack.close(); }
    if (localVideoTrack) { localVideoTrack.stop(); localVideoTrack.close(); }
    if (screenTrack) { screenTrack.stop(); screenTrack.close(); }
    if (clientRef.current) await clientRef.current.leave();
    
    setIsInCall(false);
    setIsScreenSharing(false);
    setRemoteUsers([]);
    setLocalVideoTrack(null);
    setLocalAudioTrack(null);
    setScreenTrack(null);
  };

  return (
    <CallContext.Provider value={{ 
      isInCall, isScreenSharing, roomName, remoteUsers, 
      localVideoTrack, screenTrack, joinCall, leaveCall, toggleScreenShare 
    }}>
      {children}
    </CallContext.Provider>
  );
};

export const useCall = () => useContext(CallContext);
