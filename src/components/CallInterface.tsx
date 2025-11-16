import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Phone, Mic, MicOff, Video, VideoOff, PhoneOff, MessageSquare } from "lucide-react";
import { WebRTCCall } from "@/utils/webrtc";
import { type Doctor } from "@/lib/api";
import ChatInterface from "./ChatInterface";

interface CallInterfaceProps {
  doctor: Doctor;
  userId: string;
  callId: string;
  signalingServerUrl: string;
  onEndCall: () => void;
  isCaller?: boolean;
  callerId?: string;
}

const CallInterface = ({ doctor, userId, callId, signalingServerUrl, onEndCall, isCaller = true, callerId }: CallInterfaceProps) => {
  const [callState, setCallState] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const webrtcCallRef = useRef<WebRTCCall | null>(null);

  useEffect(() => {
    const initCall = async () => {
      try {
        
        const call = new WebRTCCall(
          { signalingServerUrl },
          (remoteStream) => {
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = remoteStream;
            }
          },
          (state) => {
            console.log('Connection state:', state);
            if (state === 'connected') {
              setCallState('connected');
            } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
              setCallState('disconnected');
            }
          },
          (error) => {
            console.error('Call error:', error);
            setError(error.message);
          }
        );

        webrtcCallRef.current = call;
        
        let localStream: MediaStream;
        if (isCaller) {
          localStream = await call.startCall(callId, doctor.id, userId);
        } else {
          if (!callerId) {
            throw new Error('callerId is required when accepting an incoming call');
          }
          localStream = await call.joinCall(callId, doctor.id, userId, callerId);
        }
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }
      } catch (err) {
        console.error('Failed to start call:', err);
        setError('Failed to start call. Please check camera and microphone permissions.');
      }
    };

    initCall();

    return () => {
      webrtcCallRef.current?.endCall();
    };
  }, [callId, doctor, userId, signalingServerUrl, isCaller, callerId]);

  const handleToggleAudio = () => {
    const newState = !audioEnabled;
    setAudioEnabled(newState);
    webrtcCallRef.current?.toggleAudio(newState);
  };

  const handleToggleVideo = () => {
    const newState = !videoEnabled;
    setVideoEnabled(newState);
    webrtcCallRef.current?.toggleVideo(newState);
  };

  const handleEndCall = () => {
    webrtcCallRef.current?.endCall();
    onEndCall();
  };

  if (error) {
    return (
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
        <Card className="p-6 max-w-md">
          <h3 className="text-lg font-semibold text-destructive mb-2">Call Error</h3>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={handleEndCall} variant="outline" className="w-full">
            Close
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Header */}
      <div className="bg-card border-b p-4">
        <div className="container mx-auto flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">{doctor.name}</h2>
            <p className="text-sm text-muted-foreground">
              {callState === 'connecting' && 'Connecting...'}
              {callState === 'connected' && 'Connected'}
              {callState === 'disconnected' && 'Disconnected'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${
              callState === 'connected' ? 'bg-green-500' : 
              callState === 'connecting' ? 'bg-yellow-500 animate-pulse' : 
              'bg-red-500'
            }`} />
          </div>
        </div>
      </div>

      <div className="flex-1 relative bg-muted">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
        
        <div className="absolute top-4 right-4 w-48 h-36 bg-card border rounded-lg overflow-hidden shadow-lg">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      <div className="bg-card border-t p-6 fixed w-full bottom-0">
        <div className="container mx-auto flex items-center justify-center gap-4">
          <Button
            variant={audioEnabled ? "default" : "destructive"}
            size="lg"
            onClick={handleToggleAudio}
            className="rounded-full h-14 w-14"
          >
            {audioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </Button>
          
          <Button
            variant={videoEnabled ? "default" : "destructive"}
            size="lg"
            onClick={handleToggleVideo}
            className="rounded-full h-14 w-14"
          >
            {videoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </Button>
          
          <Button
            variant="default"
            size="lg"
            onClick={() => setShowChat(!showChat)}
            className="rounded-full h-14 w-14"
          >
            <MessageSquare className="h-5 w-5" />
          </Button>
          
          <Button
            variant="destructive"
            size="lg"
            onClick={handleEndCall}
            className="rounded-full h-14 w-14"
          >
            <PhoneOff className="h-5 w-5" />
          </Button>
        </div>
      </div>
      
      {showChat && (
        <ChatInterface
          doctorName={doctor.name}
          userId={userId}
          doctorId={doctor.id}
          callId={callId}
          signalingServerUrl={signalingServerUrl}
          onClose={() => setShowChat(false)}
        />
      )}
    </div>
  );
};

export default CallInterface;
