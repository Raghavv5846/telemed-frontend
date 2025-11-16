type ConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';
interface SignalingMessage {
  type: string;
  from?: string;
  payload?: {
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
    [key: string]: unknown;
  };
  roomId?: string;
  to?: string;
  [key: string]: unknown;
}

export class WebRTCCall {
  signalingServerUrl: string;
  ws: WebSocket | null = null;
  pc: RTCPeerConnection | null = null;
  localStream: MediaStream | null = null;
  remoteStream: MediaStream | null = null;
  onRemoteStream: (stream: MediaStream) => void;
  onStateChange: (state: ConnectionState) => void;
  onError: (err: Error) => void;
  iceCandidatesBuffer: RTCIceCandidateInit[] = [];
  isCaller = false;
  otherPeerId: string | null = null;
  roomId: string | null = null;
  userId: string | null = null;
  doctorId: string | null = null;
  pendingIceCandidates: RTCIceCandidateInit[] = []; 
  pendingOutgoingIceCandidates: RTCIceCandidateInit[] = [];
  pendingRemoteDescription: RTCSessionDescriptionInit | null = null;
  pendingAnswerBuffered = false;
  peerReady = false;
  hasSentOffer = false;

  constructor(
    opts: { signalingServerUrl: string },
    onRemoteStream: (s: MediaStream) => void,
    onStateChange: (s: ConnectionState) => void,
    onError: (e: Error) => void
  ) {
    this.signalingServerUrl = opts.signalingServerUrl;
    this.onRemoteStream = onRemoteStream;
    this.onStateChange = onStateChange;
    this.onError = onError;
  }

    private setupPeerConnection() {
      if (this.pc) {
        console.warn("PeerConnection already exists. Skipping setup.");
        return;
      }

      this.pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      this.remoteStream = new MediaStream();

      this.pc.ontrack = (evt) => {
        console.log("Got remote track:", evt.track.kind);
        this.remoteStream!.addTrack(evt.track);
        this.onRemoteStream(this.remoteStream!);
      };

      this.pc.onicecandidate = (evt) => {
        if (!evt.candidate) {
          console.log('ICE gathering complete');
          return;
        }
        const payload = { candidate: evt.candidate };
        console.log('ICE candidate generated:', { to: this.otherPeerId, roomId: this.roomId });
        if (this.otherPeerId && this.roomId) {
          console.log('Sending ICE candidate immediately');
          this.sendSignaling({ type: 'ice-candidate', roomId: this.roomId, payload, to: this.otherPeerId });
        } else {
          console.warn('ICE candidate generated but otherPeerId/roomId not set yet, buffering for later');
          this.pendingOutgoingIceCandidates.push(evt.candidate);
        }
      };

      this.pc.onconnectionstatechange = () => {
        if (!this.pc) return;
        const state = this.pc.connectionState as ConnectionState;
        this.onStateChange(state);
      };
      
      this.tryApplyBufferedRemoteDesc();
      this.flushPendingIce();
    }
  private buildWsUrl() {
    try {
      const token = JSON.parse(localStorage.getItem('currentUser') || '{}').token;
      return token ? `${this.signalingServerUrl}?token=${encodeURIComponent(token)}` : this.signalingServerUrl;
    } catch {
      return this.signalingServerUrl;
    }
  }

  private async flushPendingIce() {
    if (!this.pc) return;
    if (!this.pendingIceCandidates?.length) return;
    console.log(`Flushing ${this.pendingIceCandidates.length} pending incoming ICE candidates`);
    for (const cand of this.pendingIceCandidates) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (e) {
        console.warn('Failed to add buffered ICE candidate', e);
      }
    }
    this.pendingIceCandidates = [];
  }

  private flushPendingOutgoingIceCandidates() {
    if (!this.otherPeerId || !this.roomId || !this.peerReady) return;
    if (!this.pendingOutgoingIceCandidates?.length) return;
    console.log(`Flushing ${this.pendingOutgoingIceCandidates.length} pending outgoing ICE candidates`);
    for (const cand of this.pendingOutgoingIceCandidates) {
      const payload = { candidate: cand };
      this.sendSignaling({ type: 'ice-candidate', roomId: this.roomId, payload, to: this.otherPeerId });
    }
    this.pendingOutgoingIceCandidates = [];
  }
  
  private async tryApplyBufferedRemoteDesc() {
    if (!this.pc || !this.pendingRemoteDescription) return;
  
    try {
      const sigState = this.pc.signalingState;
      const localHasOffer = (this.pc.localDescription && this.pc.localDescription.type === 'offer');
  
      if (sigState === 'have-local-offer' || localHasOffer) {
        await this.pc.setRemoteDescription(new RTCSessionDescription(this.pendingRemoteDescription));
        this.pendingRemoteDescription = null;
        await this.flushPendingIce();
        this.flushPendingOutgoingIceCandidates();
      } 
    } catch (err) {
      console.error('Failed to apply buffered remote description', err);
    }
  }

  async startCall(roomId: string, doctorId: string, userId: string) : Promise<MediaStream> {
    this.roomId = roomId;
    this.doctorId = doctorId;
    this.userId = userId;
    this.peerReady = false;
    this.hasSentOffer = false;
    this.otherPeerId = null;

    const constraints: MediaStreamConstraints = { audio: true, video: true };
    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

    this.setupPeerConnection();

    this.localStream.getTracks().forEach(t => this.pc!.addTrack(t, this.localStream!));

    await this.openSignaling();

    this.sendSignaling({ type: 'join', roomId: this.roomId });

    this.isCaller = true;

    this.sendSignaling({ type: 'call-started', roomId: this.roomId, doctorId: this.doctorId, userId: this.userId });

    return this.localStream;
  }

  async joinCall(roomId: string, doctorId: string, userId: string, callerId: string): Promise<MediaStream> {
    this.roomId = roomId;
    this.doctorId = doctorId;
    this.userId = userId;
    this.otherPeerId = callerId;
    this.peerReady = false;
    this.hasSentOffer = false;

    // 1. get local media first
    const constraints: MediaStreamConstraints = { audio: true, video: true };
    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

    // 2. open signaling websocket and join room
    await this.openSignaling();

    // 3. join the room (but don't create peer connection yet - wait for offer)
    this.sendSignaling({ type: 'join', roomId: this.roomId });

    // 4. Mark as callee (not caller)
    this.isCaller = false;

    // Peer connection will be created when we receive the offer
    // (handled in handleSignalingMessage -> case 'offer')

    return this.localStream;
  }

  async openSignaling() {
    return new Promise<void>((resolve, reject) => {
      const wsUrl = this.buildWsUrl();
      this.ws = new WebSocket(wsUrl);

      const onOpen = () => {
        this.ws!.removeEventListener('open', onOpen);
        resolve();
      };
      const onError = (ev: Event) => {
        this.ws!.removeEventListener('error', onError);
        this.onError(new Error('Signaling WS error'));
        reject(new Error('Signaling WS error'));
      };

      this.ws.addEventListener('open', onOpen);
      this.ws.addEventListener('error', onError);

      this.ws.addEventListener('message', async (evt) => {
        try {
          const data = JSON.parse(evt.data);
          console.log('Received signaling message:', data);
          await this.handleSignalingMessage(data);
        } catch (e) {
          console.warn('Invalid signal', e, evt.data);
        }
      });

      this.ws.addEventListener('close', () => {
        this.onStateChange('closed');
      });
    });
  }

  private async handleSignalingMessage(msg: SignalingMessage) {
    const { type, from, payload, roomId } = msg;

    // keep track of other peer
    const wasOtherPeerIdSet = !!this.otherPeerId;
    if (from && from !== this.userId) {
      this.otherPeerId = from;
      this.peerReady = true;
      // If otherPeerId was just set, flush any pending outgoing ICE candidates
      if (!wasOtherPeerIdSet) {
        this.flushPendingOutgoingIceCandidates();
      }
    }

    switch (type) {
      case 'joined':
        // server ack the join. Caller now waits for peer-joined before sending offer.
        break;
        
        case 'offer': {
          const sdp = payload?.sdp;
          if (!sdp) {
            console.warn('Received offer without SDP');
            return;
          }
    
          try {
            console.log('Received offer from:', from);
            // Set otherPeerId to the caller
            if (from) {
              this.otherPeerId = from;
            }
            
            // If pc doesn't exist, we are the callee. Set it up.
            if (!this.pc) {
              // 1. Get our own media (if not already got)
              if (!this.localStream) {
                this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
              }
              
              // 2. Create the PeerConnection
              this.setupPeerConnection(); 
              
              // 3. Add our tracks *before* creating an answer
              this.localStream.getTracks().forEach(t => this.pc!.addTrack(t, this.localStream!));
            }
    
            // Now we can safely handle the offer
            console.log('Setting remote description (offer)');
            await this.pc!.setRemoteDescription(new RTCSessionDescription(sdp));
    
            // create answer
            console.log('Creating answer');
            const answer = await this.pc!.createAnswer();
            await this.pc!.setLocalDescription(answer);
    
            // send answer back to the offerer
            console.log('Sending answer:', { to: from, roomId: this.roomId });
            this.sendSignaling({
              type: 'answer',
              roomId: this.roomId,
              to: from,
              payload: { sdp: answer }
            });
    
            // flush candidate buffers
            await this.flushPendingIce();
            // Flush any pending outgoing ICE candidates now that otherPeerId is set
            this.flushPendingOutgoingIceCandidates();
          } catch (err) {
            console.error('Error handling offer', err);
            this.onError(err as Error); // Pass error to handler
          }
          break;
        }

        case 'answer': {
          const sdp = payload?.sdp;
          if (!sdp) {
            console.warn('Received answer without SDP');
            return;
          }
    
          console.log('Received answer from:', from);
          // Set otherPeerId if not already set
          if (from && !this.otherPeerId) {
            this.otherPeerId = from;
          }
    
          if (!this.pc) {
            // This is unexpected for a caller, but buffer it safely
            console.warn('Received answer but PC not ready, buffering');
            this.pendingRemoteDescription = sdp;
            this.pendingAnswerBuffered = true;
            return;
          }
    
          const sigState = this.pc.signalingState;
          const localHasOffer = (this.pc.localDescription && this.pc.localDescription.type === 'offer');
    
          if (sigState === 'have-local-offer' || localHasOffer) {
            try {
              console.log('Setting remote description (answer)');
              await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
              // flush any ICE candidates that arrived before remote desc
              await this.flushPendingIce();
              // Flush any pending outgoing ICE candidates now that otherPeerId is set
              this.flushPendingOutgoingIceCandidates();
            } catch (err) {
              console.error('Failed to set remote answer', err);
              // buffer as fallback
              this.pendingRemoteDescription = sdp;
              this.pendingAnswerBuffered = true;
            }
          } else {
            // not ready, buffer it and try later
            console.warn('PC not ready for answer, buffering. State:', sigState);
            this.pendingRemoteDescription = sdp;
            this.pendingAnswerBuffered = true;
          }
          break;
        }
        

          case 'ice-candidate': {
            const cand = payload?.candidate;
            if (!cand) {
              console.log('Received ICE candidate end-of-candidates signal');
              return;
            }
            console.log('Received ICE candidate from:', from);
            try {
              if (!this.pc) {
                console.warn('Received ICE candidate but PC not ready, buffering');
                this.pendingIceCandidates.push(cand);
                return;
              }
              if (!this.pc.remoteDescription) {
                // remote description not set yet — buffer candidate
                console.log('Remote description not set yet, buffering ICE candidate');
                this.pendingIceCandidates.push(cand);
              } else {
                console.log('Adding ICE candidate to PC');
                await this.pc.addIceCandidate(new RTCIceCandidate(cand));
              }
            } catch (err) {
              console.warn('Error adding ICE candidate; buffering', err);
              this.pendingIceCandidates.push(cand);
            }
            break;
          }

      case 'peer-joined': {
        // someone else joined the room
        let peerId: string | undefined;
        if (from && from !== this.userId) {
          peerId = from;
        } else if (payload) {
          const possiblePeerId = (payload as Record<string, unknown>).peerId;
          if (typeof possiblePeerId === 'string') {
            peerId = possiblePeerId;
          }
        }
        if (peerId) {
          this.otherPeerId = peerId;
        }
        this.peerReady = true;
        try {
          await this.tryCreateAndSendOffer();
        } catch (err) {
          console.error('Error trying to send offer after peer joined', err);
        }
        this.flushPendingOutgoingIceCandidates();
        break;
      }

      case 'peer-left': {
        // remote left -> end call
        this.peerReady = false;
        this.hasSentOffer = false;
        this.endCall();
        break;
      }

      case 'doctor-availability':
      case 'availability-list':
      case 'call-started':
      case 'call-ended':
        // availability messages - your UI may already be connected to a separate availability socket,
        // but server may also send these via signaling; ignore or handle as needed.
        break;

      default:
        console.log('Unknown signaling msg', msg);
    }
  }

  private sendSignaling(msg: SignalingMessage) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('Signaling WS not open, dropping message', msg);
      return;
    }
    console.log('Sending signaling message:', { type: msg.type, to: msg.to, roomId: msg.roomId });
    this.ws.send(JSON.stringify(msg));
  }

  toggleAudio(enabled: boolean) {
    if (!this.localStream) return;
    this.localStream.getAudioTracks().forEach(t => (t.enabled = enabled));
  }

  toggleVideo(enabled: boolean) {
    if (!this.localStream) return;
    this.localStream.getVideoTracks().forEach(t => (t.enabled = enabled));
  }

  private async tryCreateAndSendOffer() {
    if (!this.isCaller) return;
    if (this.hasSentOffer) return;
    if (!this.peerReady) {
      console.log('Peer not ready yet, delaying offer creation');
      return;
    }
    if (!this.pc) {
      console.warn('PeerConnection not ready while attempting to send offer');
      return;
    }
    if (!this.roomId) {
      console.warn('Room ID missing while attempting to send offer');
      return;
    }
    if (!this.otherPeerId) {
      console.warn('Other peer ID missing while attempting to send offer');
      return;
    }

    try {
      console.log('Creating offer for peer:', this.otherPeerId);
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      console.log('Sending offer:', { to: this.otherPeerId, roomId: this.roomId });
      this.sendSignaling({
        type: 'offer',
        roomId: this.roomId,
        to: this.otherPeerId,
        payload: { sdp: offer }
      });
      this.hasSentOffer = true;
      this.flushPendingOutgoingIceCandidates();
    } catch (err) {
      console.error('Failed to create/send offer', err);
      this.onError(err as Error);
    }
  }

  endCall() {
    // notify server call ended
    if (this.roomId && this.doctorId && this.userId) {
      this.sendSignaling({ type: 'call-ended', roomId: this.roomId, doctorId: this.doctorId, userId: this.userId });
    }

    // close pc and streams
    try {
      this.pc?.getSenders().forEach(s => { 
        try { 
          s.track?.stop(); 
        } catch (e) {
          // Ignore errors when stopping tracks
        }
      });
      this.localStream?.getTracks().forEach(t => t.stop());
    } catch (e) {
      // Ignore errors when closing streams
    }

    this.pc?.close();
    this.pc = null;

    // close ws
    // try { 
    //   this.ws?.close(); 
    // } catch (e) {
    //   // Ignore errors when closing WebSocket
    // }
    // this.ws = null;

    this.peerReady = false;
    this.hasSentOffer = false;
    this.onStateChange('closed');
  }
}