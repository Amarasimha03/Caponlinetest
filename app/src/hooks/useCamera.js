import { useState, useRef, useCallback } from 'react';
import api from '../services/api';

export function useCamera(user) {
  const [webcamReady, setWebcamReady] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState('');
  
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const cameraRequestingRef = useRef(false);

  const startWebcam = useCallback(async () => {
    if (cameraRequestingRef.current) return;
    cameraRequestingRef.current = true;
    setCameraLoading(true);
    setCameraError('');

    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      setCameraError('Camera access requires a secure HTTPS connection.');
      setCameraLoading(false);
      cameraRequestingRef.current = false;
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Your browser does not support camera access. Please use Chrome, Edge, or Firefox.');
      setCameraLoading(false);
      cameraRequestingRef.current = false;
      return;
    }

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: false
        });
      } catch (videoOnlyErr) {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      streamRef.current = stream;

      if (!stream.active) {
        setCameraError('Camera is not active. It may be blocked by another application (Zoom, Meet, Teams). Close them and retry.');
        setCameraLoading(false);
        cameraRequestingRef.current = false;
        return;
      }

      // Reliably wait for the <video> element to exist AND actually start rendering frames
      await new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 30; // 3 seconds timeout

        const tryBind = () => {
          attempts++;
          if (videoRef.current) {
            const video = videoRef.current;
            video.muted = true;       // guarantees autoplay isn't blocked, cross-browser
            video.playsInline = true; // required on iOS Safari

            if (video.srcObject !== stream) {
              video.srcObject = stream;
            }

            const onPlaying = () => {
              video.removeEventListener('playing', onPlaying);
              resolve();
            };
            video.addEventListener('playing', onPlaying);

            video.play().catch(e => {
              if (e.name !== 'AbortError') console.warn('Video play() failed:', e);
            });

            // Fallback: some browsers fire 'playing' inconsistently — also check readyState directly
            if (video.readyState >= 2) {
              video.removeEventListener('playing', onPlaying);
              resolve();
            }
          } else if (attempts >= maxAttempts) {
            reject(new Error('Video element never mounted — cannot bind camera stream.'));
          } else {
            setTimeout(tryBind, 100);
          }
        };
        tryBind();
      });

      // Only NOW do we know frames are actually flowing
      setWebcamReady(true);
      setCameraError('');
      if (user?._id) api.post('/state/monitor/save', { userId: user._id, cameraStatus: 'active' }).catch(() => {});
    } catch (err) {
      let errorMsg = 'Camera access failed. ';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = 'Camera access denied. Please allow webcam permission in your browser settings and retry.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = 'No webcam device found. Please connect a camera and retry.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMsg = 'Camera is in use by another application. Please close Zoom/Meet/Teams and retry.';
      }
      setCameraError(errorMsg);
    } finally {
      setCameraLoading(false);
      cameraRequestingRef.current = false;
    }
  }, [user]);

  const stopWebcam = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.onended = null;
        track.stop();
      });
      streamRef.current = null;
    }
    setWebcamReady(false);
  }, []);

  return { videoRef, streamRef, webcamReady, setWebcamReady, cameraLoading, cameraError, startWebcam, stopWebcam };
}
