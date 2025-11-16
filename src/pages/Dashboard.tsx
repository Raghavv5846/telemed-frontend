import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import apiClient, { type Doctor, type User } from "@/lib/api";
import { Phone, LogOut, Star, Activity } from "lucide-react";
import CallInterface from "@/components/CallInterface";
import { v4 as uuidv4} from 'uuid';

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ callId: string, callerId: string, callerName?: string } | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCall, setActiveCall] = useState<{ doctor: Doctor; callId: string; isCaller: boolean; callerId?: string } | null>(null);
  const availabilityWsRef = useRef<WebSocket | null>(null);
  
  const SIGNALING_SERVER_URL = import.meta.env.VITE_API_SIGNALING_URL;

  const reconnectTimerRef = useRef<number | null>(null);

  const [isDoctorAvailable, setIsDoctorAvailable] = useState<boolean>(false);
  const [availabilityLoading, setAvailabilityLoading] = useState<boolean>(false);

  const loadDoctors = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.getDoctors();
      if (response.data.status && response.data) {
        setDoctors(response.data.data);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load doctors",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const userStr = localStorage.getItem('currentUser');

    // const response = await apiClient.getDoctors();
    if (!userStr) {
      navigate('/');
      return;
    }
    const user = JSON.parse(userStr);
    setCurrentUser(user);
    loadDoctors();

    
    setIsDoctorAvailable(user?.status);

    const token = user.token; 
    
    const baseUrl = SIGNALING_SERVER_URL; 
    const wsUrl = token ? `${baseUrl}?token=${encodeURIComponent(token)}` : baseUrl;

    let backoff = 1000; // ms

    function connect() {
      const ws = new WebSocket(wsUrl);
      availabilityWsRef.current = ws;

      ws.onopen = () => {
        console.log('Availability WS open');
        backoff = 1000; 

        // ws.send(JSON.stringify({ type: 'register-user', userId: user.id }));

        // ws.send(JSON.stringify({ type: 'get-availability' }));
      };

      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          switch (data.type) {
            case 'incoming-call': {
              // data: { callId, from: callerId, meta: { callerName } }
              const { callId, from: callerId, meta } = data;
              showIncomingCallModal({
                callId,
                callerId,
                callerName: meta?.callerName || 'Unknown'
              });
              break;
            }
        
            case 'call-accepted': {
              console.log("you rcall has been accepted");
              
              break;
            }
        
            case 'call-declined':
            case 'call-not-answered':

            console.log("call not answreeddd");
            
              toast({ title: "Call Failed", description: `${data.doctorId ? 'Doctor' : 'Call'} not available` });
              setActiveCall(null);
              break;
            case 'doctor-availability': {
              setDoctors(prev => {
                const exists = prev.find(d => d.id === data.doctorId);
            
                if (exists) {
                  return prev.map(d => 
                    d.id === data.doctorId 
                      ? { ...d, status: !!data.isAvailable } 
                      : d
                  );
                } else {
                  const newDoctor = { 
                    id: data.doctorId, 
                    status: !!data.isAvailable, 
                    name: data.info?.name || 'Unknown',
                  } as Doctor;
                  
                  return [...prev, newDoctor];
                }
              });

              if (currentUser?.id === data.doctorId) {
                setIsDoctorAvailable(!!data.isAvailable);
              }

              break;
            }
            case 'registered': {
              console.log('ws registered ack', data);
              break;
            }
            case 'error': {
              console.warn('ws error message', data);
              break;
            }
            default:
              console.log('ws msg', data);
          }
        } catch (err) {
          console.error('Invalid WS message', err);
        }
      };

      ws.onerror = (err) => {
        console.error('Availability WS error', err);
      };

      ws.onclose = (ev) => {
        console.warn('Availability WS closed', ev.reason || ev.code);
        availabilityWsRef.current = null;
        reconnectTimerRef.current = window.setTimeout(() => {
          connect();
        }, backoff);
        backoff = Math.min(backoff * 2, 30000);
      };
    }

    connect();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (availabilityWsRef.current) {
        availabilityWsRef.current.close();
        availabilityWsRef.current = null;
      }
    };
  }, [navigate, loadDoctors, toast]);


  function showIncomingCallModal({ callId, callerId, callerName }) {
    console.log("callerId",callerId);
    
    setIncomingCall({ callId, callerId, callerName });
  }

  async function acceptIncomingCall() {
    if (!incomingCall) return;
    
    const doctor = doctors.find(d => d.id === currentUser?.id);
    if (!doctor) {
      toast({
        title: "Error",
        description: "Doctor profile not found",
        variant: "destructive",
      });
      return;
    }
    
    setActiveCall({
      doctor,
      callId: incomingCall.callId,
      isCaller: false,
      callerId: incomingCall.callerId
    });

    if (availabilityWsRef.current?.readyState === WebSocket.OPEN) {
      availabilityWsRef.current.send(JSON.stringify({
        type: 'call-accepted',
        callId: incomingCall.callId
      }));

      availabilityWsRef.current.send(JSON.stringify({
        type: 'doctor-availability',
        doctorId: doctor.id,
        isAvailable: false,
        info: { name: currentUser.name }
      }));

      await apiClient.setDoctorAvailability(doctor.id,false);

    }

    setIncomingCall(null);
  }


  function declineIncomingCall() {
    if (!incomingCall) return;
    if (availabilityWsRef.current?.readyState === WebSocket.OPEN) {
      availabilityWsRef.current.send(JSON.stringify({
        type: 'call-declined',
        callId: incomingCall.callId
      }));
    }
    setIncomingCall(null);
  }

  const handleCall = async (doctor: Doctor) => {
    if (!doctor.status) {
      toast({
        title: "Doctor Unavailable",
        description: `${doctor.name} is currently not available`,
        variant: "destructive",
      });
      return;
    }

    try {
      const callId = uuidv4();
      setActiveCall({ doctor, callId, isCaller: true}); 
        if (availabilityWsRef.current?.readyState === WebSocket.OPEN) {
          availabilityWsRef.current.send(JSON.stringify({
            type: 'call-start',
            doctorId: doctor.id,
            callId,
            payload: { meta: { callerName: currentUser?.name } }
          }));
        }
      
        toast({ title: "Ringing", description: `Calling ${doctor.name}...` });
      // }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to initiate call",
        variant: "destructive",
      });
    }
  };

  const handleEndCall = async() => {
    if (activeCall && availabilityWsRef.current?.readyState === WebSocket.OPEN) {
      availabilityWsRef.current.send(JSON.stringify({
        type: 'call-ended',
        doctorId: activeCall.doctor.id,
        userId: currentUser?.id
      }));
      availabilityWsRef.current.send(JSON.stringify({
        type: 'doctor-availability',
        doctorId: activeCall.doctor.id,
        isAvailable: true,
        info: { name: activeCall.doctor.name }
      }));
      
      await apiClient.setDoctorAvailability(activeCall.doctor.id,true);
    }
    
    setActiveCall(null);
    toast({
      title: "Call Ended",
      description: "The call has been disconnected",
    });
  };

  const handleToggleAvailability = async () => {
    if (!currentUser) return;
    const doctorId = currentUser.id;
    const newAvailability = !isDoctorAvailable;

    setIsDoctorAvailable(newAvailability);

    setDoctors(prev => prev.map(d => d.id === doctorId ? { ...d, status: newAvailability } : d));

    if (availabilityWsRef.current?.readyState === WebSocket.OPEN) {
      try {

        
        availabilityWsRef.current.send(JSON.stringify({
          type: 'doctor-availability',
          doctorId,
          isAvailable: newAvailability,
          info: { name: currentUser.name }
        }));
      } catch (e) {
        console.warn('Failed to send ws availability', e);
      }
    }

    setAvailabilityLoading(true);
    try {
      const res = await apiClient.setDoctorAvailability?.(doctorId, newAvailability);
      if (res && res.data && res.data.success === false) {
        setIsDoctorAvailable(!newAvailability);
        setDoctors(prev => prev.map(d => d.id === doctorId ? { ...d, status: !newAvailability } : d));
        toast({
          title: "Error",
          description: res.data.message || "Failed to update availability",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Availability Updated",
          description: newAvailability ? "You are now available" : "You are now unavailable",
        });
      }
    } catch (err) {
      setIsDoctorAvailable(!newAvailability);
      setDoctors(prev => prev.map(d => d.id === doctorId ? { ...d, status: !newAvailability } : d));
      toast({
        title: "Error",
        description: "Failed to update availability on server",
        variant: "destructive",
      });
      if (availabilityWsRef.current?.readyState === WebSocket.OPEN) {
        availabilityWsRef.current.send(JSON.stringify({
          type: 'doctor-availability',
          doctorId,
          isAvailable: !newAvailability,
          info: { name: currentUser.name }
        }));
      }
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const handleLogout = async() => {
    if(currentUser.role === 'DOCTOR' && availabilityWsRef.current?.readyState === WebSocket.OPEN){
        availabilityWsRef.current.send(JSON.stringify({
          type: 'doctor-availability',
          doctorId: currentUser.id,
          isAvailable: false
      }))
    }

    await apiClient.setDoctorAvailability?.(currentUser.id, false);
    localStorage.removeItem('currentUser');
    navigate('/');
  };

  useEffect(() => {
    if (!currentUser) return;
    if (typeof currentUser.isAvailable === 'boolean') {
      setIsDoctorAvailable(currentUser.isAvailable);
      return;
    }
    const me = doctors.find(d => d.id === currentUser.id);
    if (me) {
      setIsDoctorAvailable(me.status);
    }
  }, [doctors, currentUser]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Activity className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      {activeCall && (
        <CallInterface
          doctor={activeCall.doctor}
          userId={currentUser?.id || ''}
          callId={activeCall.callId}
          signalingServerUrl={SIGNALING_SERVER_URL}
          onEndCall={handleEndCall}
          isCaller={activeCall.isCaller}
          callerId={activeCall.callerId}
        />
      )}
      {incomingCall && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h3 className="text-lg font-semibold">Incoming call</h3>
            <p className="text-sm">From: {incomingCall.callerName || incomingCall.callerId}</p>
            <div className="flex gap-2 mt-4">
              <Button onClick={acceptIncomingCall}>Accept</Button>
              <Button variant="destructive" onClick={declineIncomingCall}>Decline</Button>
            </div>
          </div>
        </div>
      )}
      
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">HealthConnect</h1>
            <p className="text-sm text-muted-foreground">
              Welcome, {currentUser?.name}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* If logged-in user is a doctor, show availability toggle button in header */}
            {currentUser?.role === 'DOCTOR' && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Availability</span>
                <Button
                  onClick={handleToggleAvailability}
                  disabled={availabilityLoading}
                  variant={isDoctorAvailable ? "default" : "secondary"}
                >
                  {isDoctorAvailable ? "Go Offline" : "Go Online"}
                </Button>
              </div>
            )}

            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          {currentUser.role != 'DOCTOR' ?  <><h2 className="text-3xl font-bold text-foreground mb-2">Available Doctors</h2><p className="text-muted-foreground">Connect with healthcare professionals</p></> : <h2 className="text-3xl font-bold text-foreground mb-2">Doctor Dashboard</h2>
          }
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {currentUser.role ==='PATIENT' && doctors?.map((doctor) => (
            <Card key={doctor.id} className="hover:shadow-lg transition-all">
              <CardHeader>
                <div className="flex items-start justify-between mb-2">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-lg">
                    {doctor.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <Badge variant={doctor.status ? "default" : "secondary"}>
                    {doctor.status ? "Available" : "Busy"}
                  </Badge>
                </div>
                <CardTitle className="text-xl">{doctor.name}</CardTitle>
                <CardDescription>{doctor.specialization}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-1 mb-4 text-sm text-muted-foreground">
                  <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  <span>{doctor.rating?.toFixed(1)}</span>
                </div>
                <Button
                  className="w-full"
                  onClick={() => handleCall(doctor)}
                  disabled={!doctor.status}
                  variant={doctor.status ? "default" : "secondary"}
                >
                  <Phone className="w-4 h-4 mr-2" />
                  {doctor.status ? "Call Now" : "Not Available"}
                </Button>
              </CardContent>
            </Card>
          ))}

          {currentUser.role === 'DOCTOR' && (
            <Card className="hover:shadow-lg transition-all">
              <CardHeader>
                <div className="flex items-start justify-between mb-2">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-lg">
                    {currentUser?.name?.split(' ').map(n => n[0]).join('')}
                  </div>
                  <Badge variant={isDoctorAvailable ? "default" : "secondary"}>
                    {isDoctorAvailable ? "Available" : "Busy"}
                  </Badge>
                </div>
                <CardTitle className="text-xl">{currentUser?.name}</CardTitle>
                <CardDescription>{currentUser?.specialization || 'Your profile'}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-1 mb-4 text-sm text-muted-foreground">
                  <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  <span>{currentUser?.rating ? Number(currentUser.rating).toFixed(1) : '-'}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                  >
                    Edit Profile
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleToggleAvailability}
                    disabled={availabilityLoading}
                    variant={isDoctorAvailable ? "default" : "secondary"}
                  >
                    {isDoctorAvailable ? "Go Offline" : "Go Online"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
      </div>
    </>
  );
};

export default Dashboard;