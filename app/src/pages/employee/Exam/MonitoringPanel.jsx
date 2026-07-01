import React, { useEffect, useRef, useCallback } from 'react';
import { Camera } from 'lucide-react';
import socket from '../../../services/socket';
import useAuthStore from '../../../store/authStore';

export function MonitoringPanel({ videoRef, streamRef }) {
  const { user } = useAuthStore();
  const canvasRef = useRef(document.createElement('canvas'));

  // Callback ref to bind stream and update parent ref when element mounts
  const videoCallbackRef = useCallback((node) => {
    if (videoRef) {
      videoRef.current = node;
    }
    if (node && streamRef?.current) {
      if (node.srcObject !== streamRef.current) {
        node.srcObject = streamRef.current;
      }
      node.play().catch(err => console.warn('Monitoring Video Play Error:', err));
    }
  }, [videoRef, streamRef]);

  // Continuously ensure the stream remains attached and playing (fixes backgrounding/black frame drops)
  useEffect(() => {
    const enforcePlayback = setInterval(() => {
      if (videoRef?.current && streamRef?.current) {
        const video = videoRef.current;
        if (video.srcObject !== streamRef.current) {
          video.srcObject = streamRef.current;
        }
        if (video.paused) {
          video.play().catch(e => console.warn("Monitoring Video Play Recovery Error:", e));
        }
      }
    }, 1000);
    return () => clearInterval(enforcePlayback);
  }, [videoRef, streamRef]);

  // Base64 Live Frame Emitter
  useEffect(() => {
    const interval = setInterval(() => {
      if (videoRef?.current && user?._id) {
        const video = videoRef.current;
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          const canvas = canvasRef.current;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = canvas.toDataURL('image/jpeg', 0.5); // Compressed JPEG to save bandwidth
          
          socket.emit("candidate-frame", {
            employeeId: user._id,
            image
          });
        }
      }
    }, 1000); // 1 frame per second

    return () => clearInterval(interval);
  }, [videoRef, user]);

  return (
    <div className="card" style={{ padding: 20, position: 'sticky', top: 32 }}>
      <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)' }}>
        <Camera size={16} className="text-primary-light" /> Live Monitoring
      </h3>

      <div style={{ width: '100%', height: 200, borderRadius: 12, overflow: 'hidden', background: '#000', marginBottom: 20, border: '2px solid var(--border)' }}>
        <video ref={videoCallbackRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottom: '1px solid var(--border-light)' }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>Face Detection</span>
          <span className="badge badge-success" style={{ fontSize: 10 }}>ACTIVE</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottom: '1px solid var(--border-light)' }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>Screen Activity</span>
          <span className="badge badge-success" style={{ fontSize: 10 }}>MONITORING</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottom: '1px solid var(--border-light)' }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>Tab Switching</span>
          <span className="badge badge-success" style={{ fontSize: 10 }}>DETECTING</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>Connection Status</span>
          <span className="badge badge-success" style={{ fontSize: 10 }}>STABLE</span>
        </div>
      </div>
    </div>
  );
}
