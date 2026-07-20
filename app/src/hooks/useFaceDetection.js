import { useEffect, useRef } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as blazeface from '@tensorflow-models/blazeface';

export function useFaceDetection({ phase, videoRef, webcamReady, logViolation }) {
  const faceModelRef = useRef(null);
  const simulationIntervalRef = useRef(null);
  
  // Track consecutive seconds of anomalies
  const anomalyTimers = useRef({
    noFaceStart: null,
    multipleFaceStart: null,
    focusLossStart: null
  });

  useEffect(() => {
    (async () => {
      try {
        await tf.ready();
        faceModelRef.current = await blazeface.load();
      } catch (err) {
        console.error("BlazeFace load error:", err);
      }
    })();
  }, []);

  useEffect(() => {
    if (phase !== 'exam') return;

    anomalyTimers.current = {
      noFaceStart: null,
      multipleFaceStart: null,
      focusLossStart: null
    };

    simulationIntervalRef.current = setInterval(async () => {
      if (faceModelRef.current && videoRef.current && webcamReady) {
        const video = videoRef.current;
        if (video.readyState < 2 || video.paused) {
          return; // Skip if video not ready
        }

        try {
          const predictions = await faceModelRef.current.estimateFaces(video, false);

          const validPersons = predictions.filter(p => {
            const score = Array.isArray(p.probability) ? p.probability[0] : (p.probability || p.score || 1);
            if (score < 0.85) return false;
            return true;
          });

          const now = Date.now();

          // 1. Multiple Person Detection
          if (validPersons.length > 1) {
            if (!anomalyTimers.current.multipleFaceStart) anomalyTimers.current.multipleFaceStart = now;
            else if (now - anomalyTimers.current.multipleFaceStart > 3000) {
              logViolation('MULTIPLE_PERSON', 'Multiple persons detected in camera frame.');
              anomalyTimers.current.multipleFaceStart = null; // Reset to await next incident
            }
          } else {
            anomalyTimers.current.multipleFaceStart = null;
          }

          // 2. Face Missing Detection
          if (validPersons.length === 0) {
            if (!anomalyTimers.current.noFaceStart) anomalyTimers.current.noFaceStart = now;
            else if (now - anomalyTimers.current.noFaceStart > 3000) {
              logViolation('NO_FACE', 'Face not detected in camera frame.');
              anomalyTimers.current.noFaceStart = null; // Reset
            }
          } else {
            anomalyTimers.current.noFaceStart = null;
          }

          // 3. Focus Loss Detection (Head Pose Estimation)
          if (validPersons.length === 1) {
            const face = validPersons[0];
            let isLookingAway = false;
            
            if (face.landmarks) {
              const rightEye = face.landmarks[0];
              const leftEye = face.landmarks[1];
              const nose = face.landmarks[2];

              // Calculate horizontal distance from nose to each eye
              const dxRight = Math.abs(nose[0] - rightEye[0]);
              const dxLeft = Math.abs(leftEye[0] - nose[0]);
              
              // If the ratio is heavily skewed, the face is turned
              const ratio = dxLeft / (dxRight || 1);
              if (ratio > 2.5 || ratio < 0.4) {
                isLookingAway = true;
              }
            }

            if (isLookingAway) {
              if (!anomalyTimers.current.focusLossStart) anomalyTimers.current.focusLossStart = now;
              else if (now - anomalyTimers.current.focusLossStart > 3000) { // 3 seconds continuous focus loss
                logViolation('FOCUS_LOSS', 'Candidate is looking away from the screen.');
                anomalyTimers.current.focusLossStart = null;
              }
            } else {
              anomalyTimers.current.focusLossStart = null;
            }
          } else {
             // If not exactly 1 person, reset focus timer
             anomalyTimers.current.focusLossStart = null;
          }

        } catch (e) {
          console.warn("Face estimation skipped this frame", e);
        }
      }
    }, 1000); // Check every second

    return () => {
      if (simulationIntervalRef.current) clearInterval(simulationIntervalRef.current);
    };
  }, [phase, webcamReady, videoRef, logViolation]);

  const clearFaceDetection = () => {
    if (simulationIntervalRef.current) clearInterval(simulationIntervalRef.current);
  };

  return { clearFaceDetection };
}
