import { create } from 'zustand';
import socket from '../services/socket';
import api from '../services/api';

// Registry of RTCPeerConnections mapped by employeeId
// Stored outside the React/Zustand state tree to avoid proxying or triggering infinite renders
const peerConnections = {};

// Per-peer stream identity registry: maps employeeId → Set of seen stream IDs
// First unseen stream ID = camera, second unseen stream ID = screen
const peerStreamRegistry = {};

// Maps employeeId → { cameraStreamId, screenStreamId }
const peerStreamIdMap = {};

// Backoff counter — stops poll spam after repeated 401 / network failures
let consecutiveFailures = 0;
const MAX_FAILURES = 3;

// Track completed exams in this session to prevent race conditions where fetchMonitoringData resurrects them
const completedExams = new Set();

const useMonitoringStore = create((set, get) => ({
  activeExams: [],
  violations: [],
  connected: false,
  initialized: false,

  // Fetch active exams from backend and merge with current streaming state
  fetchMonitoringData: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      console.warn('[MonitoringStore] No token — skipping fetch');
      return;
    }

    // Pause polling after too many consecutive failures — re-login to resume
    if (consecutiveFailures >= MAX_FAILURES) {
      console.warn(`[MonitoringStore] ${MAX_FAILURES} consecutive failures — polling paused. Re-login to resume.`);
      return;
    }

    try {
      const res = await api.get('/live-monitoring');
      const fetched = res.data || [];
      consecutiveFailures = 0; // reset on success

      set((state) => {
        const updatedExams = fetched
          .filter(item => !completedExams.has(String(item.employeeId)))
          .map((item) => {
            const existing = state.activeExams.find((p) => String(p.employeeId) === String(item.employeeId));
            return {
              ...item,
              employeeId: String(item.employeeId),
              cameraActive: item.cameraActive || (existing?.cameraActive ?? false),
              webrtcConnected: existing?.webrtcConnected ?? (peerConnections[item.employeeId]?.connectionState === 'connected'),
              cameraStream: existing?.cameraStream ?? null,
              screenStream: existing?.screenStream ?? null,
              lastViolation: existing?.lastViolation ?? null,
            };
          });
        return { activeExams: updatedExams };
      });

    } catch (err) {
      consecutiveFailures++;
      if (err.response?.status === 401) {
        console.error(`[MonitoringStore] 401 — token invalid (failure ${consecutiveFailures}/${MAX_FAILURES}). Check api.js interceptor.`);
      } else {
        console.error('[MonitoringStore] Fetch failed:', err.message);
      }
    }
  },

  // ✅ Restore streams from existing peer connections without renegotiating
  // Called when AdminMonitoring mounts/remounts after navigation
  restoreStreams: () => {
    const activePeers = Object.keys(peerConnections);
    if (activePeers.length === 0) return false; // No existing connections to restore

    let restoredCount = 0;
    set((state) => {
      const updatedExams = state.activeExams.map((exam) => {
        const pc = peerConnections[exam.employeeId];
        if (!pc) return exam;

        // If still connected and streams already in state, keep them
        if (exam.cameraStream || exam.screenStream) {
          restoredCount++;
          return exam;
        }

        // Try to restore from active receivers
        const receivers = pc.getReceivers ? pc.getReceivers() : [];
        const videoReceivers = receivers.filter(r => r.track && r.track.kind === 'video' && r.track.readyState === 'live');

        if (videoReceivers.length === 0) return exam;

        let cameraStream = exam.cameraStream;
        let screenStream = exam.screenStream;

        if (!cameraStream && videoReceivers[0]?.track) {
          cameraStream = new MediaStream([videoReceivers[0].track]);
          console.log(`[MonitoringStore] Restored camera stream for ${exam.employeeId}`);
        }
        if (!screenStream && videoReceivers[1]?.track) {
          screenStream = new MediaStream([videoReceivers[1].track]);
          console.log(`[MonitoringStore] Restored screen stream for ${exam.employeeId}`);
        }

        if (cameraStream || screenStream) restoredCount++;

        return {
          ...exam,
          cameraStream: cameraStream ?? exam.cameraStream,
          screenStream: screenStream ?? exam.screenStream,
          webrtcConnected: pc.connectionState === 'connected' || exam.webrtcConnected,
        };
      });
      return { activeExams: updatedExams };
    });

    console.log(`[MonitoringStore] restoreStreams: restored ${restoredCount} peers`);
    return restoredCount > 0;
  },

  // Initialize Socket.IO listeners exactly once
  init: () => {
    if (get().initialized) return;

    socket.on('connect', () => {
      set({ connected: true });
      socket.emit('admin:join');
    });

    socket.on('admin:active-exams', (exams) => {
      set((state) => {
        const updated = exams.map((e) => {
          const existing = state.activeExams.find((p) => p.employeeId === e.employeeId);
          return {
            ...e,
            cameraActive: true,
            webrtcConnected: existing ? existing.webrtcConnected : false,
            cameraStream: existing ? existing.cameraStream : null,
            screenStream: existing ? existing.screenStream : null,
            lastViolation: existing ? existing.lastViolation : null,
          };
        });
        return { activeExams: updated };
      });
    });

    socket.on('exam:employee-joined', (data) => {
      set((state) => {
        if (state.activeExams.some((e) => e.employeeId === data.employeeId)) return {};
        return {
          activeExams: [
            ...state.activeExams,
            { ...data, cameraActive: true, webrtcConnected: false, cameraStream: null, screenStream: null }
          ]
        };
      });
      // Request renegotiation to establish connection
      socket.emit('webrtc:request-renegotiate');
    });

    socket.on('webrtc:offer', async (data) => {
      const { employeeId, offer, socketId, cameraStreamId, screenStreamId } = data;
      console.log(`[MonitoringStore] WebRTC offer received from ${employeeId}`);

      // Close existing connection if any
      if (peerConnections[employeeId]) {
        peerConnections[employeeId].close();
      }

      // Reset stream registry for this peer
      peerStreamRegistry[employeeId] = new Set();
      peerStreamIdMap[employeeId] = { cameraStreamId, screenStreamId };

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' },
          {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          },
          {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          },
          {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          }
        ]
      });
      peerConnections[employeeId] = pc;

      pc.ontrack = (event) => {
        const track = event.track;
        if (track.kind !== 'video') return;
        
        console.log(`[MonitoringStore] ontrack from ${employeeId}:`, track.kind, track.label, 'muted:', track.muted);

        // --- DIAGNOSTICS START: Monitor if TURN server is dropping RTP packets ---
        const intervalId = setInterval(async () => {
          if (pc.connectionState === 'closed') {
            clearInterval(intervalId);
            return;
          }
          const stats = await pc.getStats();
          stats.forEach(r => {
            if (r.type === 'inbound-rtp' && r.kind === 'video' && r.trackId) {
              const inboundTrack = pc.getReceivers().find(rec => rec.track.id === r.trackId)?.track;
              if (inboundTrack && inboundTrack.id === track.id) {
                console.log(`[Diagnostics - ${employeeId}] ${track.label} | bytesReceived: ${r.bytesReceived} | packetsLost: ${r.packetsLost} | muted: ${track.muted}`);
              }
            }
          });
        }, 2000);
        // --- DIAGNOSTICS END ---

        const streamIds = peerStreamIdMap[employeeId] || {};
        const registry = peerStreamRegistry[employeeId];

        // Use track.id as identity key (unique per track, unlike stream.id which can alias)
        if (registry.has(track.id)) return;
        registry.add(track.id);

        // Build a clean MediaStream containing only this track
        const ownStream = new MediaStream([track]);

        // Determine camera vs screen by matching the stream ID sent in the offer payload
        // event.streams[0].id is the stream the employee originally added this track to
        const originStreamId = event.streams?.[0]?.id ?? null;
        let isCamera;
        if (streamIds.cameraStreamId && originStreamId === streamIds.cameraStreamId) {
          isCamera = true;
        } else if (streamIds.screenStreamId && originStreamId === streamIds.screenStreamId) {
          isCamera = false;
        } else {
          // Fallback: first unseen track = camera, second = screen
          isCamera = registry.size === 1;
        }

        console.log(`[MonitoringStore] Assigning ${isCamera ? 'CAMERA' : 'SCREEN'} track for ${employeeId} (originStream: ${originStreamId})`);

        const applyStream = (stream) => {
          set((state) => {
            const exists = state.activeExams.some((e) => String(e.employeeId) === String(employeeId));

            if (!exists) {
              return {
                activeExams: [
                  ...state.activeExams,
                  {
                    employeeId: String(employeeId),
                    employeeName: 'Connecting...',
                    cameraActive: true,
                    webrtcConnected: true,
                    cameraStream: isCamera ? stream : null,
                    screenStream: isCamera ? null : stream,
                  }
                ]
              };
            }

            return {
              activeExams: state.activeExams.map((e) => {
                if (String(e.employeeId) !== String(employeeId)) return e;
                if (isCamera) {
                  return { ...e, cameraStream: stream, webrtcConnected: true };
                } else {
                  return { ...e, screenStream: stream, webrtcConnected: true };
                }
              }),
            };
          });
        };

        // Apply immediately — track may already be live
        applyStream(ownStream);

        // Re-apply on unmute: remote tracks start muted until first RTP packet.
        // Wrapping in a NEW MediaStream forces React's memo to detect a reference change
        // and re-attach srcObject, breaking the black screen on delayed media arrival.
        track.addEventListener('unmute', () => {
          console.log(`[MonitoringStore] Track UNMUTED for ${employeeId} (${isCamera ? 'camera' : 'screen'}) — forcing re-render`);
          applyStream(new MediaStream([track]));
        });

        // Also handle the case where the track was already live when ontrack fired
        if (!track.muted) {
          applyStream(new MediaStream([track]));
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('webrtc:ice-candidate', { to: socketId, candidate: event.candidate });
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        console.log(`[MonitoringStore] Connection state changed for ${employeeId}: ${state}`);
        if (state === 'disconnected' || state === 'failed') {
          set((s) => ({
            activeExams: s.activeExams.map((e) =>
              e.employeeId === employeeId ? { ...e, webrtcConnected: false } : e
            ),
          }));
        } else if (state === 'connected') {
          set((s) => ({
            activeExams: s.activeExams.map((e) =>
              e.employeeId === employeeId ? { ...e, webrtcConnected: true } : e
            ),
          }));
        }
      };

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        if (pc.candidateQueue) {
          for (const candidate of pc.candidateQueue) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.error("Queued AddIceCandidate Error:", e));
          }
          pc.candidateQueue = [];
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc:answer', { to: socketId, answer });
      } catch (err) {
        console.error('[MonitoringStore] WebRTC signaling error:', err);
      }
    });

    socket.on('webrtc:ice-candidate', async (data) => {
      const pc = peerConnections[data.employeeId];
      if (pc && data.candidate) {
        try {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          } else {
            if (!pc.candidateQueue) pc.candidateQueue = [];
            pc.candidateQueue.push(data.candidate);
          }
        } catch (err) {
          console.error('[MonitoringStore] AddIceCandidate error:', err);
        }
      }
    });

    socket.on('exam:completed', (data) => {
      console.log(`[MonitoringStore] Exam completed/terminated for ${data.employeeId}`);
      if (peerConnections[data.employeeId]) {
        peerConnections[data.employeeId].close();
        delete peerConnections[data.employeeId];
      }
      delete peerStreamRegistry[data.employeeId];
      delete peerStreamIdMap[data.employeeId];
      
      // Mark as completed to prevent fetchMonitoringData from resurrecting them
      completedExams.add(String(data.employeeId));
      
      set((state) => {
        const emp = state.activeExams.find(e => String(e.employeeId) === String(data.employeeId));
        const empName = emp ? emp.employeeName : 'Employee';
        const reason = data.terminationReason || 'Submitted successfully';
        
        const completionAlert = {
          employeeId: data.employeeId,
          employeeName: empName,
          type: 'COMPLETED',
          description: `Exam Completed: ${reason}`,
          timestamp: new Date()
        };

        return {
          violations: [completionAlert, ...state.violations].slice(0, 50),
          activeExams: state.activeExams.filter((e) => String(e.employeeId) !== String(data.employeeId)),
        };
      });
    });

    socket.on('exam:employee-disconnected', (data) => {
      console.log(`[MonitoringStore] Employee disconnected: ${data.employeeId}`);
      if (peerConnections[data.employeeId]) {
        peerConnections[data.employeeId].close();
        delete peerConnections[data.employeeId];
      }
      delete peerStreamRegistry[data.employeeId];
      delete peerStreamIdMap[data.employeeId];
      set((state) => ({
        activeExams: state.activeExams.map((e) =>
          e.employeeId === data.employeeId
            ? { ...e, webrtcConnected: false, cameraStream: null, screenStream: null }
            : e
        ),
      }));
    });

    socket.on('violation:alert', (data) => {
      console.log(`[MonitoringStore] Proctoring alert for ${data.employeeName}: ${data.description}`);
      const alertWithTime = { ...data, timestamp: new Date() };
      set((state) => ({
        violations: [alertWithTime, ...state.violations].slice(0, 50),
        activeExams: state.activeExams.map((e) =>
          e.employeeId === data.employeeId
            ? { ...e, lastViolation: data.description, violationCount: (parseInt(e.violationCount) || 0) + 1 }
            : e
        ),
      }));
    });

    socket.on('disconnect', () => {
      set({ connected: false });
    });

    if (socket.connected) {
      set({ connected: true });
      socket.emit('admin:join');
    }

    set({ initialized: true });
  },

  // ✅ Fix 1 — Terminate an employee's exam from the admin side
  terminateExam: (employeeId, employeeSocketId) => {
    console.log(`[MonitoringStore] Terminating exam for ${employeeId}`);

    // Tell server to force-disconnect the employee's socket
    socket.emit('admin:terminate-exam', { employeeId, employeeSocketId });

    // Close peer connection on admin side
    if (peerConnections[employeeId]) {
      peerConnections[employeeId].close();
      delete peerConnections[employeeId];
    }
    delete peerStreamRegistry[employeeId];
    delete peerStreamIdMap[employeeId];

    // Remove from admin UI immediately (don't wait for exam:completed echo)
    set((state) => ({
      activeExams: state.activeExams.filter((e) => e.employeeId !== employeeId),
    }));
  },

  // ✅ Rejoin admin room — tries restoreStreams first, falls back to renegotiation
  rejoin: () => {
    socket.emit('admin:join');
    // restoreStreams() will be called by AdminMonitoring on mount — 
    // do not force renegotiation if peers are already connected
  },

  // Close and clean up all connections if needed
  destroy: () => {
    Object.keys(peerConnections).forEach((key) => {
      peerConnections[key].close();
      delete peerConnections[key];
    });
    Object.keys(peerStreamRegistry).forEach((key) => {
      delete peerStreamRegistry[key];
    });
    Object.keys(peerStreamIdMap).forEach((key) => {
      delete peerStreamIdMap[key];
    });
    socket.off('connect');
    socket.off('admin:active-exams');
    socket.off('exam:employee-joined');
    socket.off('webrtc:offer');
    socket.off('webrtc:ice-candidate');
    socket.off('exam:completed');
    socket.off('exam:employee-disconnected');
    socket.off('violation:alert');
    socket.off('disconnect');
    set({ initialized: false, activeExams: [], violations: [], connected: false });
  }
}));

export default useMonitoringStore;
