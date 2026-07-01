import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import api from '../../../services/api';
import socket from '../../../services/socket';
import useAuthStore from '../../../store/authStore';

import { useCamera } from '../../../hooks/useCamera';
import { useScreenShare } from '../../../hooks/useScreenShare';
import { useExamTimer } from '../../../hooks/useExamTimer';
import { useFaceDetection } from '../../../hooks/useFaceDetection';
import { useViolations } from '../../../hooks/useViolations';
import { useAutoSave } from '../../../hooks/useAutoSave';

import { WebRTCManager } from '../../../managers/WebRTCManager';
import { cleanupExamSession } from '../../../managers/CleanupManager';
import { enterFullscreen, exitFullscreen } from '../../../managers/FullscreenManager';

import { SetupPage } from './SetupPage';
import { ExamLayout } from './ExamLayout';
import { ResultModal } from './ResultModal';

export default function ExamPage() {
  const { assessmentId } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const [phase, setPhase] = useState('setup'); // setup, initializing, exam, submitted
  const [initStatus, setInitStatus] = useState('Starting camera...');
  const [dbSaving, setDbSaving] = useState(false);
  const [assessment, setAssessment] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [resultId, setResultId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [resultModalData, setResultModalData] = useState(null);
  const [violations, setViolations] = useState(0);

  const socketRef = useRef(null);
  const webrtcManagerRef = useRef(null);
  const submittingRef = useRef(false);
  const maxViolations = 3;
  const LS_EXAM_KEY = `examState_${assessmentId}`;

  // Managers/Hooks
  const { videoRef, streamRef, webcamReady, cameraLoading, cameraError, startWebcam, stopWebcam } = useCamera(user);
  const { screenStreamRef, screenReady, screenError, startScreenShare, stopScreenShare } = useScreenShare();

  const broadcastExamStart = useCallback(() => {
    if (user?._id) {
      // Emit the requested specification socket event
      socketRef.current?.emit('join-exam', {
        examId: assessmentId,
        userId: user._id,
        employeeName: user.fullName
      });
      if (streamRef.current || screenStreamRef.current) {
        webrtcManagerRef.current?.setupWebRTC(streamRef.current, screenStreamRef.current);
      }
    }
  }, [user, assessmentId, streamRef, screenStreamRef]);

  useEffect(() => {
    socketRef.current = socket;
    webrtcManagerRef.current = new WebRTCManager(socket, user, assessmentId);

    const handleConnect = () => {
      if (phase === 'exam') {
        broadcastExamStart();
      }
    };

    const handleRenegotiate = () => {
      console.log('📡 WebRTC renegotiation requested by admin');
      if (streamRef.current || screenStreamRef.current) {
        webrtcManagerRef.current?.setupWebRTC(streamRef.current, screenStreamRef.current);
      }
    };

    socketRef.current?.on('connect', handleConnect);
    // Explicitly listen to socket.io's reconnect event just in case
    socketRef.current?.io?.on('reconnect', handleConnect);
    
    socketRef.current?.on('webrtc:answer', (data) => webrtcManagerRef.current?.handleAnswer(data));
    socketRef.current?.on('webrtc:ice-candidate', (data) => webrtcManagerRef.current?.handleIceCandidate(data));
    socketRef.current?.on('webrtc:request-renegotiate', handleRenegotiate);

    return () => {
      socketRef.current?.off('connect', handleConnect);
      socketRef.current?.io?.off('reconnect', handleConnect);
      socketRef.current?.off('webrtc:answer');
      socketRef.current?.off('webrtc:ice-candidate');
      socketRef.current?.off('webrtc:request-renegotiate', handleRenegotiate);
    };
  }, [phase, user, assessmentId, streamRef, screenStreamRef, broadcastExamStart]);

  useEffect(() => {
    (async () => {
      try {
        const myExamsRes = await api.get('/assessments/my');
        if (myExamsRes.data.success) {
          const matchedExam = myExamsRes.data.assessments?.find(a => a._id === assessmentId);
          if (matchedExam && matchedExam.status === 'completed') {
            toast.error('You have already completed this assessment. Retakes are not allowed.');
            navigate('/employee/dashboard');
            return;
          }
        }

        const { data } = await api.get(`/assessments/${assessmentId}`);
        setAssessment(data.assessment);
        const sortedQ = (data.assessment.questions || []).sort((a, b) =>
          String(a.title || '').localeCompare(String(b.title || ''), undefined, { numeric: true, sensitivity: 'base' })
        );
        setQuestions(sortedQ);

        const lsCached = localStorage.getItem(LS_EXAM_KEY);
        if (lsCached) {
          try {
            const saved = JSON.parse(lsCached);
            if (saved.assessmentId === assessmentId) {
              if (saved.phase && saved.phase !== 'submitted') setPhase(saved.phase);
              if (saved.currentQ !== undefined) setCurrentQ(saved.currentQ);
              if (saved.resultId) setResultId(saved.resultId);
              if (saved.violations !== undefined) setViolations(saved.violations);
              if (saved.answers) setAnswers(saved.answers);
            }
          } catch { }
        }
      } catch {
        toast.error('Failed to load exam');
        navigate('/employee/dashboard');
      }
    })();
  }, [assessmentId, navigate, LS_EXAM_KEY]);

  const terminateExam = useCallback(async (reason = "Terminated") => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);

    try {
      const formattedAnswers = Object.keys(answers).map(qId => ({
        questionId: qId,
        selectedAnswer: answers[qId]?.selectedOptions.length === 1 ? answers[qId].selectedOptions[0] : answers[qId].selectedOptions
      }));

      const response = await api.post(`/submit-exam`, {
        answers: formattedAnswers,
        violations,
        resultId,
        autoSubmit: true,
        autoSubmitReason: reason
      });

      // Emit specification submit-exam socket event
      socketRef.current?.emit('submit-exam', {
        examId: assessmentId,
        userId: user?._id,
        employeeId: user?._id,
        answers: formattedAnswers
      });

      socketRef.current?.emit('exam:cancelled', { employeeId: user?._id, assessmentId });

      // Clean up streams and fullscreen
      webrtcManagerRef.current?.cleanup();
      await cleanupExamSession({
        stopCamera: stopWebcam,
        stopScreenShare: stopScreenShare,
        stopTimer: () => { },
        disconnectSocket: () => { },
        clearLocalStorage: () => {
          localStorage.removeItem(LS_EXAM_KEY);
          localStorage.removeItem('employee_assessments_cache');
          localStorage.removeItem('employee_assessments_timestamp');
        },
        exitFullscreen: exitFullscreen
      });

      // Show animated result modal for completed exams
      if (reason === 'Completed') {
        const resultData = response?.data;
        setPhase('submitted');
        setResultModalData({
          percentage: parseFloat(resultData?.percentage) || 0,
          passed: resultData?.passed === true || resultData?.passed === 'true' || String(resultData?.passed).toLowerCase() === 'true',
          totalScore: parseInt(resultData?.totalScore) || 0,
          totalMarks: parseInt(resultData?.totalMarks) || parseInt(resultData?.totalQuestions) || questions.length,
          correctCount: parseInt(resultData?.correctCount) || 0,
          wrongCount: parseInt(resultData?.wrongCount) || 0,
          unansweredCount: parseInt(resultData?.unansweredCount) || (questions.length - Object.keys(answers).length),
          totalQuestions: parseInt(resultData?.totalQuestions) || questions.length,
        });
      } else {
        setPhase('submitted');
        navigate("/employee/dashboard", { replace: true });
      }
    } catch (err) {
      console.warn("Failed to submit exam payload:", err);
      // Fallback cleanup on error
      webrtcManagerRef.current?.cleanup();
      await cleanupExamSession({
        stopCamera: stopWebcam,
        stopScreenShare: stopScreenShare,
        stopTimer: () => { },
        disconnectSocket: () => { },
        clearLocalStorage: () => {
          localStorage.removeItem(LS_EXAM_KEY);
          localStorage.removeItem('employee_assessments_cache');
          localStorage.removeItem('employee_assessments_timestamp');
        },
        exitFullscreen: exitFullscreen
      });
      navigate("/employee/dashboard", { replace: true });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting, answers, violations, resultId, assessmentId, user, stopWebcam, stopScreenShare, logout, navigate, LS_EXAM_KEY, questions]);

  const { timer, setTimer } = useExamTimer({
    initialTimer: assessment?.duration ? assessment.duration * 60 : 1800,
    phase,
    currentQ,
    questionsCount: questions.length,
    timePerQuestion: assessment?.timePerQuestion || 30,
    onTimeExpired: () => terminateExam('Time Expired'),
    autoNextQ: () => handleNext(true)
  });

  const { logViolation } = useViolations({
    phase: submitting ? 'submitted' : phase, user, assessmentId, resultId, violations, setViolations, maxViolations, socketRef, onTerminate: terminateExam
  });

  useFaceDetection({
    phase, videoRef, webcamReady, logViolation
  });

  useAutoSave({ LS_EXAM_KEY, phase, currentQ, timer, resultId, violations, answers, assessmentId, user });

  const handleNext = useCallback((isAutoTimeout = false) => {
    if (!isAutoTimeout) {
      const q = questions[currentQ];
      if (!answers[q?._id]?.selectedOptions?.length) {
        toast.error("Please select an answer");
        return;
      }
    }
    if (currentQ < questions.length - 1) {
      setCurrentQ(prev => prev + 1);
      setTimer(assessment?.timePerQuestion || 30);
    } else if (isAutoTimeout) {
      // Only auto-submit on timeout from last question
      terminateExam("Completed");
    }
    // If user clicks Next on last question, don't auto-submit — they use the Submit button
  }, [currentQ, questions, answers, assessment, setTimer, terminateExam]);

  const handlePrev = useCallback(() => {
    if (currentQ > 0) {
      setCurrentQ(prev => prev - 1);
      setTimer(assessment?.timePerQuestion || 30);
    }
  }, [currentQ, assessment, setTimer]);

  const handleJumpTo = useCallback((index) => {
    if (index >= 0 && index < questions.length) {
      setCurrentQ(index);
      setTimer(assessment?.timePerQuestion || 30);
    }
  }, [questions.length, assessment, setTimer]);

  const handleSelect = useCallback((questionId, optionIndex) => {
    const q = questions[currentQ];
    setAnswers(prev => {
      const current = prev[questionId]?.selectedOptions || [];
      let updatedOptions;
      if (q.type === 'multiple-select') {
        updatedOptions = current.includes(optionIndex)
          ? current.filter(i => i !== optionIndex)
          : [...current, optionIndex];
      } else {
        updatedOptions = [optionIndex];
      }
      return { ...prev, [questionId]: { selectedOptions: updatedOptions } };
    });
  }, [questions, currentQ]);

  const startWebcamOnly = async () => {
    setPhase('initializing');
    setInitStatus('Configuring proctor camera...');
    try {
      await startWebcam();
      setInitStatus('Please share your screen to proceed.');
    } catch (err) {
      toast.error(err.message || "Failed to start camera.");
      setPhase('setup');
    }
  };

  const handleScreenShareEnable = async () => {
    const screenStopCallback = () => {
      logViolation('screen-share-stop', 'Screen share was stopped', 'Terminated - Screen Share Stopped');
    };
    setInitStatus('Activating screen sharing...');
    try {
      const stream = await startScreenShare(screenStopCallback);
      if (stream) {
        setInitStatus('Proctoring active. You can now start the exam!');
      } else {
        setInitStatus('Please share your entire screen to proceed.');
      }
    } catch (err) {
      toast.error(err.message || "Failed to share screen.");
    }
  };

  const startExamConfirmed = async () => {
    if (!webcamReady || !screenReady) {
      toast.error("Webcam and Screen share must be active before starting the exam.");
      return;
    }

    setDbSaving(true);
    setInitStatus('Entering fullscreen mode...');
    try {
      await enterFullscreen();
      setInitStatus('Saving exam start event to database...');

      const { data } = await api.post(`/assessments/start`, { assessmentId });
      if (data.success) {
        setResultId(data.result?._id || data.resultId);
        broadcastExamStart();
        setPhase('exam');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to start exam');
      await cleanupExamSession({ stopCamera: stopWebcam, stopScreenShare: stopScreenShare, exitFullscreen });
      setPhase('setup');
    } finally {
      setDbSaving(false);
    }
  };

  if (!user || (!assessment && phase === 'setup')) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  if (phase === 'setup') {
    return <SetupPage assessment={assessment} questionsCount={questions.length} maxViolations={maxViolations} onStart={startWebcamOnly} />;
  }

  if (phase === 'initializing') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', color: '#fff', padding: 20 }}>

        {/* Camera Preview */}
        <div style={{ position: 'relative', width: 320, height: 200, borderRadius: 16, overflow: 'hidden', background: '#000', border: '2.5px solid var(--primary)', marginBottom: 20, boxShadow: '0 10px 40px rgba(0,0,0,0.6)' }}>
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', display: webcamReady ? 'block' : 'none' }} 
          />
          {!webcamReady && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
              <div className="spinner"></div>
            </div>
          )}
          {webcamReady && (
            <div style={{ position: 'absolute', bottom: 12, left: 12, background: 'rgba(0,0,0,0.65)', padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: 6, backdropFilter: 'blur(4px)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} /> Camera Active
            </div>
          )}
        </div>

        <h2>Initializing Exam...</h2>
        <p style={{ color: 'var(--primary)', fontWeight: 600, fontSize: 16, marginTop: 10, letterSpacing: '0.02em', textAlign: 'center' }}>{initStatus}</p>

        {/* Proctoring Control Checklist */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 360, marginTop: 24, marginBottom: 12 }}>
          {/* Camera Status Row with Action */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(255,255,255,0.03)', padding: '14px 18px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Webcam Stream</span>
              <span style={{ fontSize: 13, color: webcamReady ? '#10b981' : cameraError ? '#ef4444' : '#f59e0b', fontWeight: 700 }}>
                {webcamReady ? '✓ ACTIVE' : cameraError ? '✗ FAILED' : '⏳ CONNECTING...'}
              </span>
            </div>
            {!webcamReady && (
              <button
                onClick={startWebcam}
                disabled={cameraLoading}
                className="btn btn-primary btn-sm"
                style={{ width: '100%', marginTop: 6, justifyContent: 'center', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', padding: '10px', borderRadius: 8, fontWeight: 700 }}
              >
                {cameraLoading ? 'Starting Camera...' : 'Retry Camera Access'}
              </button>
            )}
            {!webcamReady && cameraError && (
              <p style={{ color: '#f87171', fontSize: 12, marginTop: 6, textAlign: 'center' }}>{cameraError}</p>
            )}
          </div>

          {/* Screen Share Status Row with Action */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(255,255,255,0.03)', padding: '14px 18px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Screen Sharing</span>
              <span style={{ fontSize: 13, color: screenReady ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                {screenReady ? '✓ ACTIVE' : '✗ DISENGAGED'}
              </span>
            </div>
            {!screenReady && (
              <button
                onClick={handleScreenShareEnable}
                className="btn btn-primary btn-sm"
                style={{ width: '100%', marginTop: 6, justifyContent: 'center', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', padding: '10px', borderRadius: 8, fontWeight: 700 }}
              >
                Enable Screen Sharing
              </button>
            )}
            {!screenReady && screenError && (
              <p style={{ color: '#f87171', fontSize: 12, marginTop: 6, textAlign: 'center' }}>{screenError}</p>
            )}
          </div>
        </div>

        {/* Action Button Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 360, marginTop: 20 }}>
          {webcamReady && screenReady && (
            <button
              onClick={startExamConfirmed}
              disabled={dbSaving}
              className="btn btn-success btn-lg"
              style={{
                width: '100%', background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none',
                boxShadow: '0 0 20px rgba(16,185,129,0.3)', color: '#fff', fontSize: 16, fontWeight: 800,
                padding: '14px 20px', borderRadius: 12, cursor: 'pointer', transition: 'all 0.2s', justifyContent: 'center'
              }}
            >
              {dbSaving ? 'Entering Exam...' : 'START EXAM NOW'}
            </button>
          )}

          <button
            onClick={async () => {
              await cleanupExamSession({ stopCamera: stopWebcam, stopScreenShare: stopScreenShare, exitFullscreen });
              setPhase('setup');
            }}
            className="btn btn-sm"
            style={{
              background: 'rgba(239,68,68,0.1)', color: '#ef4444',
              border: '1px solid rgba(239,68,68,0.2)', padding: '10px 24px',
              borderRadius: 10, cursor: 'pointer', fontSize: 14, transition: 'all 0.2s', width: '100%', justifyContent: 'center'
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#ef4444'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
          >
            Cancel & Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <ExamLayout
        assessment={assessment}
        questionsCount={questions.length}
        currentQ={currentQ}
        violations={violations}
        maxViolations={maxViolations}
        videoRef={videoRef}
        streamRef={streamRef}
        question={questions[currentQ]}
        answers={answers}
        handleSelect={handleSelect}
        handleNext={() => handleNext(false)}
        handlePrev={handlePrev}
        handleJumpTo={handleJumpTo}
        submitting={submitting}
        submitExam={() => terminateExam('Completed')}
        cancelExam={() => terminateExam('User Cancelled Exam')}
        timer={timer}
        user={user}
        questions={questions}
      />
      <ResultModal
        show={!!resultModalData}
        result={resultModalData}
        onViewDetails={() => navigate(`/employee/result/${assessmentId}`, { replace: true })}
        onDashboard={() => navigate('/employee/dashboard', { replace: true })}
      />
    </>
  );
}
