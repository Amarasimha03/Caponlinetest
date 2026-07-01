import { useEffect, useRef } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as blazeface from '@tensorflow-models/blazeface';
import toast from 'react-hot-toast';

export function useFaceDetection({ phase, videoRef, webcamReady, logViolation }) {
  const faceModelRef = useRef(null);
  const simulationIntervalRef = useRef(null);
  const lastFaceDetectedTimeRef = useRef(Date.now());
  const multiPersonActiveSinceRef = useRef(null);
  const multiplePersonWarningsRef = useRef(0);
  const lastCameraWarningRef = useRef(Date.now());

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

    // Reset timers when entering the exam phase to avoid penalizing the time spent in the setup screen
    lastFaceDetectedTimeRef.current = Date.now();
    lastCameraWarningRef.current = Date.now();
    multiPersonActiveSinceRef.current = null;

    simulationIntervalRef.current = setInterval(async () => {
      if (faceModelRef.current && videoRef.current && webcamReady) {
        const video = videoRef.current;
        if (video.readyState < 2 || video.paused) {
          // Video isn't actually delivering frames right now — skip this cycle,
          // don't count it as a missing-face violation
          return;
        }

        try {
          const predictions = await faceModelRef.current.estimateFaces(video, false);

          const validPersons = predictions.filter(p => {
            const score = Array.isArray(p.probability) ? p.probability[0] : (p.probability || p.score || 1);
            if (score < 0.85) return false;
            if (p.topLeft && p.bottomRight) {
              const width = p.bottomRight[0] - p.topLeft[0];
              const height = p.bottomRight[1] - p.topLeft[1];
              if (width < 80 || height < 80) return false;
            }
            return true;
          });

          if (validPersons.length === 1) {
            lastFaceDetectedTimeRef.current = Date.now();
            multiPersonActiveSinceRef.current = null;
          } else if (validPersons.length === 0) {
            multiPersonActiveSinceRef.current = null;
            const timeWithoutFace = (Date.now() - lastFaceDetectedTimeRef.current) / 1000;

            if (timeWithoutFace >= 15) {
              const msg = "Terminated due to Face Not Visible for 15+ seconds.";
              toast.error(msg, { duration: 5000 });
              logViolation('no-face', msg, "Terminated - Face Not Visible");
            } else if (timeWithoutFace >= 5 && Date.now() - lastCameraWarningRef.current > 6000) {
              lastCameraWarningRef.current = Date.now();
              toast.error(`Warning: Face missing for ${Math.floor(timeWithoutFace)}s. Exam auto-cancels at 15s.`, { duration: 4000 });
              logViolation('no-face', `Face missing for ${Math.floor(timeWithoutFace)}s`);
            }
          } else if (validPersons.length > 1) {
            if (!multiPersonActiveSinceRef.current) {
              multiPersonActiveSinceRef.current = Date.now();
            } else {
              const duration = Date.now() - multiPersonActiveSinceRef.current;
              if (duration >= 5000) {
                multiPersonActiveSinceRef.current = Date.now();
                multiplePersonWarningsRef.current += 1;
                const count = multiplePersonWarningsRef.current;
                let msg = "";
                if (count === 1) msg = "Warning 1:\nMultiple persons detected.\nPlease ensure only one person is visible.";
                else if (count === 2) msg = "Warning 2:\nAnother person is still detected.\nExam may be cancelled.";
                else if (count === 3) msg = "Final Warning:\nMultiple persons detected again.\nNext violation will automatically terminate the exam.";
                else msg = "Exam terminated due to repeated multiple-person violations.";

                toast.error(msg, { duration: 6000 });
                logViolation('multiple-persons', msg, count >= 4 ? "Terminated - Multiple Persons" : null);
              }
            }
          }
        } catch (e) {
          console.warn("Face estimation skipped this frame", e);
        }
      }
    }, 1000);

    return () => {
      if (simulationIntervalRef.current) clearInterval(simulationIntervalRef.current);
    };
  }, [phase, webcamReady, videoRef, logViolation]);

  const clearFaceDetection = () => {
    if (simulationIntervalRef.current) clearInterval(simulationIntervalRef.current);
  };

  return { clearFaceDetection };
}
