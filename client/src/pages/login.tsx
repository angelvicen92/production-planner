import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle, Mail, KeyRound } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function LoginPage() {
  const {
    user,
    isLoading,
    signInWithMagicLink,
    isSendingMagicLink,
    signInWithPassword,
    isSigningInWithPassword,
  } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (user) {
      setLocation("/dashboard");
    }
  }, [user, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const trimmedEmail = email.trim();
  const isAnyLoading = isSendingMagicLink || isSigningInWithPassword;

  const handleMagicLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSent(false);

    try {
      await signInWithMagicLink({ email: trimmedEmail });
      setSent(true);
    } catch (err: any) {
      setError(err?.message || "No se pudo enviar el enlace.");
    }
  };

  const handlePasswordLogin = async () => {
    setError(null);
    setSent(false);

    if (!password.trim()) {
      setError("Introduce contraseña");
      return;
    }

    try {
      await signInWithPassword({ email: trimmedEmail, password });
    } catch (err: any) {
      setError(err?.message || "No se pudo iniciar sesión con contraseña.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl -translate-y-1/2" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl translate-y-1/2" />

      <Card className="w-full max-w-md shadow-2xl border-white/20 backdrop-blur-sm bg-card/80 z-10">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-3xl font-bold tracking-tight">OptiPlan</CardTitle>
          <CardDescription className="text-base">Inicia sesión con email y contraseña o enlace mágico</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <form onSubmit={handleMagicLinkSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña (opcional para enlace)</Label>
              <Input
                id="password"
                type="password"
                placeholder="Introduce tu contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {sent && (
              <Alert>
                <Mail className="h-4 w-4" />
                <AlertDescription>Te hemos enviado un enlace para iniciar sesión. Revisa tu correo.</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Button type="submit" className="w-full" disabled={!trimmedEmail || isAnyLoading}>
                {isSendingMagicLink && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar enlace
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handlePasswordLogin}
                disabled={!trimmedEmail || isAnyLoading}
              >
                {isSigningInWithPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                Entrar con contraseña
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
