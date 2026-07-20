export class WebRTCManager {
  constructor(socket, user, assessmentId) {
    this.socket = socket;
    this.user = user;
    this.assessmentId = assessmentId;
    this.pc = null;
    this.candidateQueue = [];
  }

  async setupWebRTC(cameraStream, screenStream) {
    if (!this.socket) return;
    
    if (this.pc) {
      this.pc.close();
    }

    const configuration = {
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
    };
    this.pc = new RTCPeerConnection(configuration);
    this.candidateQueue = [];

    if (cameraStream) {
      cameraStream.getTracks().forEach(track => {
        this.pc.addTrack(track, cameraStream);
      });
    }

    if (screenStream) {
      screenStream.getTracks().forEach(track => {
        this.pc.addTrack(track, screenStream);
      });
    }

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('webrtc:ice-candidate', {
          toAdmin: true,
          employeeId: this.user?._id,
          candidate: event.candidate,
        });
      }
    };

    // Auto-reconnection logic
    this.pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE Connection State: ${this.pc.iceConnectionState}`);
      if (this.pc.iceConnectionState === 'disconnected' || this.pc.iceConnectionState === 'failed') {
        console.warn('[WebRTC] Connection lost. Attempting auto-reconnect in 3s...');
        setTimeout(() => {
          if (this.socket && this.user) {
            this.setupWebRTC(cameraStream, screenStream);
          }
        }, 3000);
      }
    };

    try {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.socket.emit('webrtc:offer', {
        employeeId: this.user?._id,
        offer: offer,
        cameraStreamId: cameraStream?.id,
        screenStreamId: screenStream?.id,
      });
    } catch (err) {
      console.error('WebRTC Offer Error:', err);
    }
  }

  async handleAnswer(data) {
    if (this.pc && this.pc.signalingState !== 'stable') {
      try {
        await this.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        if (this.candidateQueue.length > 0) {
          for (const candidate of this.candidateQueue) {
            await this.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.error(e));
          }
          this.candidateQueue = [];
        }
      } catch (err) {
        console.error("SetRemoteDescription Error:", err);
      }
    }
  }

  async handleIceCandidate(data) {
    if (this.pc && data.candidate) {
      try {
        if (this.pc.remoteDescription && this.pc.remoteDescription.type) {
          await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } else {
          this.candidateQueue.push(data.candidate);
        }
      } catch (err) {
        console.error("AddIceCandidate Error:", err);
      }
    }
  }

  cleanup() {
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
  }
}
