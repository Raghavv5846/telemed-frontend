import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, X } from "lucide-react";

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'doctor';
  timestamp: Date;
}

interface ChatInterfaceProps {
  doctorName: string;
  userId: string;
  doctorId: string;
  callId: string;
  signalingServerUrl: string;
  onClose: () => void;
}

const ChatInterface = ({ doctorName, userId, doctorId, callId, signalingServerUrl, onClose }: ChatInterfaceProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('currentUser');

    // const response = await apiClient.getDoctors();
    const user = JSON.parse(userStr);
    const token = user.token; 
    
    const baseUrl = signalingServerUrl; 
    const wsUrl = token ? `${baseUrl}?token=${encodeURIComponent(token)}` : baseUrl;

    const ws = new WebSocket(wsUrl);
    
    console.log(ws,"wsss");
    
    ws.onopen = () => {
      console.log('Chat WebSocket connected');
      setIsConnected(true);
      
      // Join chat room
      ws.send(JSON.stringify({
        type: 'join-chat',
        callId,
        userId,
        doctorId
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'chat-message') { 
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          text: data.message,
          sender: data.senderId === userId ? 'user' : 'doctor',
          timestamp: new Date()
        }]);  
      }
    };

    ws.onerror = (error) => {
      console.error('Chat WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('Chat WebSocket disconnected');
      setIsConnected(false);
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, [callId, userId, doctorId, signalingServerUrl]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inputText.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const message = {
      type: 'chat-message',
      callId,
      senderId: userId,
      receiverId: doctorId,
      message: inputText
    };

    wsRef.current.send(JSON.stringify(message));
    
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user',
      timestamp: new Date()
    }]);
    
    setInputText("");
  };

  return (
    <Card className="fixed bottom-4 right-4 w-80 h-96 flex flex-col shadow-lg z-50">
      <div className="flex items-center justify-between p-4 border-b bg-primary text-primary-foreground">
        <div>
          <h3 className="font-semibold">{doctorName}</h3>
          <p className="text-xs opacity-90">
            {isConnected ? 'Online' : 'Connecting...'}
          </p>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onClose}
          className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        {messages.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm mt-8">
            Start a conversation with {doctorName}
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg px-3 py-2 ${
                    message.sender === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  }`}
                >
                  <p className="text-sm">{message.text}</p>
                  <p className="text-xs opacity-70 mt-1">
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <form onSubmit={handleSendMessage} className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message..."
            disabled={!isConnected}
            className="flex-1"
          />
          <Button 
            type="submit" 
            size="icon"
            disabled={!isConnected || !inputText.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </Card>
  );
};

export default ChatInterface;
