import React, { useEffect, useState, useRef, memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, User, Camera, Maximize2, X, Activity, ShieldAlert, Monitor } from 'lucide-react';
import useMonitoringStore from '../../store/monitoringStore';

// Reliable stream attachment helper that safely handles video playback
function attachStream(ref, stream) {
  if (!ref.current || !stream) return () => { };
  const video = ref.current;

  // Extract the video track
  const tracks = stream.getVideoTracks();
  if (tracks.length === 0) return () => { };

  // Wrap the track in a new MediaStream!
  // This is CRITICAL for WebRTC remote streams in React.
  // Moving the exact same MediaStream object between the grid <video> and the modal <video>
  // causes the browser's hardware decoder to stall and show a black screen.
  // Wrapping it in a new MediaStream creates a fresh playback pipeline.
  const wrappedStream = new MediaStream([tracks[0]]);

  video.srcObject = wrappedStream;
  video.muted = true;
  video.playsInline = true;

  const playPromise = video.play();
  if (playPromise !== undefined) {
    playPromise.catch(e => {
      // Ignore harmless AbortError when video is unmounted or source changed rapidly
      if (e.name !== 'AbortError') {
        console.warn("Video play error:", e);
      }
    });
  }

  return () => {
    if (video) video.srcObject = null;
  };
}

// A dedicated video component that safely attaches streams exactly when mounted
const LiveVideo = memo(({ stream, style }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (stream) {
      const detach = attachStream(videoRef, stream);
      return () => detach();
    }
  }, [stream]);

  return <video ref={videoRef} autoPlay playsInline muted style={style} />;
});

// Memoized CandidateCard to prevent re-rendering videos unnecessarily when other states change
const CandidateCard = memo(({ candidate, onMaximize }) => {
  const cameraRef = useRef(null);
  const screenRef = useRef(null);

  const hasCamera = !!candidate.cameraStream;
  const hasScreen = !!candidate.screenStream;
  const hasAnyStream = hasCamera || hasScreen;

  useEffect(() => {
    let detachCamera = () => { };
    let detachScreen = () => { };

    const timer = setTimeout(() => {
      if (candidate.cameraStream) {
        detachCamera = attachStream(cameraRef, candidate.cameraStream);
      }
      if (candidate.screenStream) {
        detachScreen = attachStream(screenRef, candidate.screenStream);
      }
    }, 50);

    return () => {
      clearTimeout(timer);
      detachCamera();
      detachScreen();
    };
  }, [candidate.cameraStream, candidate.screenStream]);

  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      className="card" style={{
        padding: 0, overflow: 'hidden', border: `1px solid ${candidate.webrtcConnected ? 'var(--border)' : '#ef4444'}`,
        position: 'relative', display: 'flex', flexDirection: 'column',
        height: '100%'
      }}>

      {/* Media Container: Split view or single view or hidden */}
      {hasAnyStream && (
        <div style={{
          width: '100%', height: 160, display: 'flex', background: '#000', position: 'relative'
        }}>
          {/* Camera Video */}
          {hasCamera && (
            <div style={{ flex: 1, borderRight: hasScreen ? '1px solid #333' : 'none', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <LiveVideo stream={candidate.cameraStream} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
              <div style={{ position: 'absolute', bottom: 4, left: 4, background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: 4, fontSize: 9, color: '#fff', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Camera size={10} /> CAMERA
              </div>
            </div>
          )}

          {/* Screen Video */}
          {hasScreen && (
            <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <LiveVideo stream={candidate.screenStream} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              <div style={{ position: 'absolute', bottom: 4, left: 4, background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: 4, fontSize: 9, color: '#fff', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Monitor size={10} /> SCREEN
              </div>
            </div>
          )}

          {/* Header overlay badges */}
          <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 8 }}>
            <span className={`badge ${candidate.webrtcConnected ? 'badge-success' : 'badge-danger animate-pulse'}`} style={{ fontSize: 9, padding: '2px 6px' }}>
              {candidate.webrtcConnected ? 'LIVE P2P' : 'CONNECTING...'}
            </span>
            {candidate.violationCount > 0 && (
              <span className="badge badge-danger" style={{ fontSize: 9, padding: '2px 6px' }}>
                {candidate.violationCount} Violations
              </span>
            )}
          </div>

          <button onClick={() => onMaximize(candidate)} style={{
            position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.5)',
            border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Maximize2 size={14} />
          </button>
        </div>
      )}

      {/* Footer Details */}
      <div style={{ padding: '12px', borderTop: '1px solid var(--border-light)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="avatar" style={{ width: 28, height: 28, fontSize: 12, background: 'var(--gradient-primary)', color: '#fff', fontWeight: 700 }}>
            {candidate.employeeName?.[0]}
          </div>
          <div style={{ overflow: 'hidden', flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{candidate.employeeName}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>ID: {candidate.employeeId?.slice(-6)}</div>
          </div>
        </div>
        {!hasAnyStream && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <span className={`badge ${candidate.webrtcConnected ? 'badge-success' : 'badge-danger animate-pulse'}`} style={{ fontSize: 9, padding: '2px 6px' }}>
              {candidate.webrtcConnected ? 'LIVE P2P' : 'DISCONNECTED'}
            </span>
            {candidate.violationCount > 0 && (
              <span className="badge badge-danger" style={{ fontSize: 9, padding: '2px 6px' }}>
                {candidate.violationCount} Violations
              </span>
            )}
          </div>
        )}
        {candidate.lastViolation && (
          <div style={{
            marginTop: 8, padding: '6px 8px', background: 'rgba(239, 68, 68, 0.08)',
            borderRadius: 6, border: '1px dashed rgba(239,68,68,0.2)', fontSize: 10, color: '#f87171',
            whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden'
          }}>
            <strong>Alert:</strong> {candidate.lastViolation}
          </div>
        )}
      </div>
    </motion.div>
  );
});

// Add CSS keyframe for loading spinner if not already present
if (typeof document !== 'undefined' && !document.getElementById('monitoring-keyframes')) {
  const style = document.createElement('style');
  style.id = 'monitoring-keyframes';
  style.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
  document.head.appendChild(style);
}

export default function AdminMonitoring() {
  const { activeExams, violations, connected, fetchMonitoringData, rejoin, terminateExam, restoreStreams } = useMonitoringStore();
  const [selectedCandidate, setSelectedCandidate] = useState(null);

  const selectedCameraRef = useRef(null);
  const selectedScreenRef = useRef(null);

  useEffect(() => {
    fetchMonitoringData();
    // ✅ Try to restore streams from existing peer connections first
    // Only trigger full renegotiation if no active connections exist
    const didRestore = restoreStreams();
    if (!didRestore) {
      rejoin(); // No existing connections — ask employees to send new offers
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Modal stream attachment is now handled safely inside LiveVideo components
  // No need for unreliable timeouts or global refs here!
  useEffect(() => {
    const currentCandidate = selectedCandidate ? activeExams.find(e => e.employeeId === selectedCandidate.employeeId) : null;

    if (selectedCandidate && !currentCandidate) {
      // Candidate submitted exam or disconnected — auto-close the modal
      setSelectedCandidate(null);
    }
  }, [selectedCandidate, activeExams]);

  const violationFeed = useMemo(() => {
    return violations.length > 0 ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {violations.map((v, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            style={{
              padding: '12px 14px', background: 'rgba(255,255,255,0.01)',
              borderRadius: 12, border: '1px solid var(--border-light)'
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>{v.employeeName}</span>
              <span className="badge badge-danger" style={{ fontSize: 10, textTransform: 'uppercase' }}>
                {v.type?.replace(/-/g, ' ')}
              </span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
              {v.description}
            </p>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
              {new Date(v.timestamp).toLocaleTimeString()}
            </div>
          </motion.div>
        ))}
      </div>
    ) : (
      <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-muted)' }}>
        <ShieldAlert size={32} style={{ color: 'var(--border)', marginBottom: 8 }} />
        <p style={{ fontSize: 12 }}>No violations detected during this session.</p>
      </div>
    );
  }, [violations]);

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Header banner */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '24px 32px', background: 'var(--bg-card)', borderRadius: 16,
        border: '1px solid var(--border)', marginBottom: 28,
        boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.15)'
      }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Activity size={24} className="text-primary-light" style={{ animation: 'pulse 2s infinite' }} />
            Live Proctoring Terminal (WebRTC)
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
            10-User Real-time camera & screen sharing feeds using P2P streaming.
          </p>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(255,255,255,0.03)', padding: '8px 16px',
          borderRadius: 30, border: '1px solid var(--border)'
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: connected ? '#10b981' : '#ef4444',
            boxShadow: connected ? '0 0 10px #10b981' : '0 0 10px #ef4444'
          }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: connected ? '#10b981' : '#ef4444' }}>
            {connected ? 'SOCKET CONNECTED' : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* Main proctoring layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 1fr)', gap: 28 }}>

        {/* Left Side: 2x5 Real-time Grid */}
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Monitor size={20} className="text-primary-light" /> Live Candidate Feeds ({activeExams.length})
          </h2>

          {activeExams.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
              {activeExams.map((candidate, i) => (
                <CandidateCard
                  key={candidate.employeeId || i}
                  candidate={candidate}
                  onMaximize={setSelectedCandidate}
                />
              ))}
            </div>
          ) : (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '60px 20px', textAlign: 'center' }}>
              <div style={{
                width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.03)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)'
              }}>
                <User size={28} style={{ color: 'var(--text-muted)' }} />
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>No candidates are currently active</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
                  Camera and screen streams will establish automatically when exams start.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Telemetric Event Log */}
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={20} className="text-warning" /> Proctoring Alerts
          </h2>

          <div className="card" style={{ padding: 20, maxHeight: 580, overflowY: 'auto' }}>
            {violationFeed}
          </div>
        </div>
      </div>

      {/* Full-screen Candidate Monitor Modal */}
      <AnimatePresence>
        {selectedCandidate && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(11, 15, 25, 0.95)',
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
          }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="card" style={{
                maxWidth: 900, width: '100%', padding: 0, border: '1px solid var(--border)',
                overflow: 'hidden', boxShadow: '0 10px 50px -10px rgba(0,0,0,0.5)'
              }}>

              {/* Modal Header */}
              <div style={{
                padding: '16px 24px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-light)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
                  <span style={{ fontSize: 14, fontWeight: 700 }}>Proctoring: {selectedCandidate.employeeName}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* ✅ Fix 4 — Terminate Exam button */}
                  <button
                    onClick={() => {
                      terminateExam(selectedCandidate.employeeId, selectedCandidate.socketId);
                      setSelectedCandidate(null);
                    }}
                    style={{
                      background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
                      borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
                      color: '#ef4444', fontSize: 12, fontWeight: 700,
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <ShieldAlert size={14} /> Terminate Exam
                  </button>
                  <button onClick={() => setSelectedCandidate(null)} style={{
                    background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div style={{ padding: 24 }}>
                <div style={{ display: 'flex', gap: 20, height: 380 }}>
                  {/* Camera */}
                  <div style={{ flex: 1, borderRadius: 12, overflow: 'hidden', background: '#000', border: '1px solid var(--border)', position: 'relative' }}>
                    <LiveVideo stream={activeExams.find(e => e.employeeId === selectedCandidate.employeeId)?.cameraStream} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                    <div style={{ position: 'absolute', bottom: 12, left: 12, background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: 6, fontSize: 12, color: '#fff' }}>
                      <Camera size={14} style={{ display: 'inline', marginRight: 6 }} /> Live Camera
                    </div>
                  </div>
                  {/* Screen */}
                  <div style={{ flex: 1, borderRadius: 12, overflow: 'hidden', background: '#000', border: '1px solid var(--border)', position: 'relative' }}>
                    <LiveVideo stream={activeExams.find(e => e.employeeId === selectedCandidate.employeeId)?.screenStream} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    <div style={{ position: 'absolute', bottom: 12, left: 12, background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: 6, fontSize: 12, color: '#fff' }}>
                      <Monitor size={14} style={{ display: 'inline', marginRight: 6 }} /> Screen Share
                    </div>
                  </div>
                </div>

                <div style={{
                  marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16,
                  padding: 16, background: 'rgba(255,255,255,0.01)', borderRadius: 10,
                  border: '1px solid var(--border-light)'
                }}>
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>CANDIDATE NAME</span>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginTop: 4 }}>{selectedCandidate.employeeName}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>CANDIDATE ID</span>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginTop: 4 }}>{selectedCandidate.employeeId}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>VIOLATIONS LOGGED</span>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#ef4444', marginTop: 4 }}>
                      {selectedCandidate.violationCount || 0} alerts
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>WEBRTC STATE</span>
                    <div style={{ fontSize: 14, fontWeight: 700, color: selectedCandidate.webrtcConnected ? '#10b981' : '#ef4444', marginTop: 4 }}>
                      {selectedCandidate.webrtcConnected ? 'P2P Connected' : 'Disconnected'}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
