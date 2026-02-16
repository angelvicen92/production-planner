import { useAuth } from "@/hooks/use-auth";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle, Mail, KeyRound } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

type AuthView = "login" | "signup" | "forgot" | "reset";

export default function LoginPage() {
  const {
    user,
    isLoading,
    signInWithMagicLink,
    isSendingMagicLink,
    signInWithPassword,
    isSigningInWithPassword,
    signUpWithPassword,
    isSigningUpWithPassword,
    sendPasswordResetEmail,
    isSendingPasswordResetEmail,
    updatePassword,
    isUpdatingPassword,
  } = useAuth();
  const [location, setLocation] = useLocation();
  const search = useMemo(() => new URLSearchParams(window.location.search), [location]);
  const hashSearch = useMemo(() => new URLSearchParams(window.location.hash.replace(/^#/, "")), [location]);
  const isRecoveryFlow = search.get("type") === "recovery" || hashSearch.get("type") === "recovery";

  const [view, setView] = useState<AuthView>(isRecoveryFlow ? "reset" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    if (isRecoveryFlow) {
      setView("reset");
      setError(null);
      setSent(null);
    }
  }, [isRecoveryFlow]);

  useEffect(() => {
    if (user && view !== "reset") {
      setLocation("/dashboard");
    }
  }, [user, view, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const trimmedEmail = email.trim();
  const isBusy =
    isSendingMagicLink ||
    isSigningInWithPassword ||
    isSigningUpWithPassword ||
    isSendingPasswordResetEmail ||
    isUpdatingPassword;

  const resetMessages = () => {
    setError(null);
    setSent(null);
  };

  const handleLoginSubmit = async (method: "auto" | "magic" | "password") => {
    resetMessages();

    if (!trimmedEmail) {
      setError("Introduce email");
      return;
    }

    const hasPassword = Boolean(password?.trim());
    const shouldUsePassword = method === "password" || (method === "auto" && hasPassword);

    if (shouldUsePassword) {
      if (!hasPassword) {
        setError("Introduce contraseña");
        return;
      }

      if ((password?.trim().length ?? 0) < 6) {
        setError("Contraseña muy corta");
        return;
      }

      try {
        await signInWithPassword({ email: trimmedEmail, password });
        setSent("Inicio de sesión correcto.");
      } catch (err: any) {
        const rawMessage = String(err?.message ?? "").toLowerCase();
        if (rawMessage.includes("invalid") || rawMessage.includes("credentials") || rawMessage.includes("password")) {
          setError(
            "Contraseña incorrecta. Si no recuerdas tu contraseña, utiliza ‘Recuperar contraseña’ o ‘Enviar enlace’",
          );
          return;
        }
        setError(err?.message || "No se pudo iniciar sesión con contraseña.");
      }

      return;
    }

    try {
      await signInWithMagicLink({ email: trimmedEmail });
      setSent("Te hemos enviado un enlace para iniciar sesión. Revisa tu correo.");
    } catch (err: any) {
      setError(err?.message || "No se pudo enviar el enlace.");
    }
  };

  const handleLoginFormSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isBusy) {
      return;
    }
    await handleLoginSubmit("auto");
  };

  const handleSignUp = async () => {
    resetMessages();

    if (!password.trim()) {
      setError("Introduce una contraseña para crear tu cuenta.");
      return;
    }

    try {
      await signUpWithPassword({ email: trimmedEmail, password });
      setSent("Cuenta creada. Si tu proyecto requiere confirmación, revisa tu correo para activarla.");
      setView("login");
    } catch (err: any) {
      setError(err?.message || "No se pudo crear la cuenta.");
    }
  };

  const handleForgotPassword = async () => {
    resetMessages();

    try {
      await sendPasswordResetEmail({ email: trimmedEmail });
      setSent("Te enviamos un enlace para restablecer tu contraseña.");
    } catch (err: any) {
      setError(err?.message || "No se pudo enviar el email de recuperación.");
    }
  };

  const handleUpdatePassword = async () => {
    resetMessages();

    if (!newPassword.trim()) {
      setError("Introduce una nueva contraseña.");
      return;
    }

    try {
      await updatePassword({ password: newPassword });
      setSent("Contraseña actualizada correctamente. Ya puedes iniciar sesión.");
      setNewPassword("");
      setView("login");
      setLocation("/login");
    } catch (err: any) {
      setError(err?.message || "No se pudo actualizar la contraseña.");
    }
  };

  const showLogin = view === "login";
  const showSignUp = view === "signup";
  const showForgot = view === "forgot";
  const showReset = view === "reset";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl -translate-y-1/2" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl translate-y-1/2" />

      <Card className="w-full max-w-md shadow-2xl border-white/20 backdrop-blur-sm bg-card/80 z-10">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-3xl font-bold tracking-tight">OptiPlan</CardTitle>
          <CardDescription className="text-base">
            {showReset
              ? "Establecer nueva contraseña"
              : showSignUp
                ? "Crea tu cuenta con email y contraseña"
                : showForgot
                  ? "Recupera acceso a tu cuenta"
                  : "Inicia sesión con email y contraseña o enlace mágico"}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 pt-4">
          {showLogin && (
            <form onSubmit={handleLoginFormSubmit} className="space-y-4">
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
                  <AlertDescription>{sent}</AlertDescription>
                </Alert>
              )}

              <Button
                type="button"
                className="w-full"
                onClick={() => void handleLoginSubmit("magic")}
                disabled={isBusy}
              >
                {isSendingMagicLink && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar enlace
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => void handleLoginSubmit("password")}
                disabled={isBusy}
              >
                {isSigningInWithPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                Entrar con contraseña
              </Button>

              <div className="flex items-center justify-between text-sm pt-2">
                <button type="button" className="text-primary hover:underline" onClick={() => setView("signup")}>
                  Crear cuenta
                </button>
                <button type="button" className="text-primary hover:underline" onClick={() => setView("forgot")}>
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            </form>
          )}

          {showSignUp && (
            <>
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
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Crea tu contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </>
          )}

          {showForgot && (
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
          )}

          {showReset && (
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nueva contraseña</Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="Introduce tu nueva contraseña"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
          )}

          {!showLogin && error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!showLogin && sent && (
            <Alert>
              <Mail className="h-4 w-4" />
              <AlertDescription>{sent}</AlertDescription>
            </Alert>
          )}

          {showSignUp && (
            <Button type="button" className="w-full" onClick={handleSignUp} disabled={!trimmedEmail || isBusy}>
              {isSigningUpWithPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crear cuenta
            </Button>
          )}

          {showForgot && (
            <Button type="button" className="w-full" onClick={handleForgotPassword} disabled={!trimmedEmail || isBusy}>
              {isSendingPasswordResetEmail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar email de recuperación
            </Button>
          )}

          {showReset && (
            <Button type="button" className="w-full" onClick={handleUpdatePassword} disabled={!newPassword.trim() || isBusy}>
              {isUpdatingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Actualizar contraseña
            </Button>
          )}

          {!showReset && !showLogin && (
            <div className="flex items-center justify-between text-sm pt-2">
              <button type="button" className="text-primary hover:underline" onClick={() => setView("login")}>
                Volver a iniciar sesión
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
