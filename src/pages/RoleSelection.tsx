import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Stethoscope } from "lucide-react";

const RoleSelection = () => {
  const navigate = useNavigate();

  const handleRoleSelect = (role: 'doctor' | 'user') => {
    navigate('/auth', { state: { role } });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">HealthConnect</h1>
          <p className="text-muted-foreground">Choose how you'd like to continue</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary" onClick={() => handleRoleSelect('user')}>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-2xl">I'm a Patient</CardTitle>
              <CardDescription>Looking for medical consultation</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" size="lg">
                Continue as Patient
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-secondary" onClick={() => handleRoleSelect('doctor')}>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center">
                <Stethoscope className="w-8 h-8 text-secondary" />
              </div>
              <CardTitle className="text-2xl">I'm a Doctor</CardTitle>
              <CardDescription>Providing medical consultation</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" size="lg" variant="secondary">
                Continue as Doctor
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default RoleSelection;
