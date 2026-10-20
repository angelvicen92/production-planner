import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ConfirmOptions = {
  title: string;
  description?: string;
  secondaryText?: string;
  details?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};
type InputOptions = ConfirmOptions & {
  label: string;
  defaultValue?: string;
  inputMode?: "text" | "decimal";
  validate: (value: string) => string | null;
  onSubmit: (value: string) => Promise<unknown> | void;
};
type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
type InputFn = (options: InputOptions) => Promise<boolean>;
type Request = { kind: "confirm"; options: ConfirmOptions } | { kind: "input"; options: InputOptions };
const ConfirmContext = createContext<ConfirmFn | null>(null);
const InputContext = createContext<InputFn | null>(null);

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<{ request: Request; resolve: (value: boolean) => void } | null>(null);
  const submitting = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const mounted = useRef(true);
  const id = useId();
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; active.current?.resolve(false); active.current = null; };
  }, []);
  const closeWith = useCallback((value: boolean) => {
    const pending = active.current;
    if (!pending || submitting.current) return;
    active.current = null;
    setRequest(null);
    pending.resolve(value);
  }, []);
  // Reject overlapping requests safely: never replace another caller's resolver.
  const open = useCallback((next: Request) => {
    if (!mounted.current || active.current) return Promise.resolve(false);
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setText(next.kind === "input" ? next.options.defaultValue ?? "" : "");
    setError(null);
    setSaving(false);
    setRequest(next);
    return new Promise<boolean>(resolve => { active.current = { request: next, resolve }; });
  }, []);
  const confirm = useCallback<ConfirmFn>(options => open({ kind: "confirm", options }), [open]);
  const input = useCallback<InputFn>(options => open({ kind: "input", options }), [open]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const pending = active.current;
    if (!pending || pending.request.kind !== "input" || submitting.current) return;
    const options = pending.request.options;
    const validation = options.validate(text);
    if (validation) { setError(validation); return; }
    submitting.current = true; setSaving(true); setError(null);
    try {
      await options.onSubmit(text);
      if (mounted.current && active.current === pending) { submitting.current = false; closeWith(true); }
    } catch {
      if (mounted.current && active.current === pending) setError("No se pudo guardar. Revisa los datos e inténtalo de nuevo.");
    } finally {
      submitting.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    if (!active.current && opener.current?.isConnected) opener.current.focus();
  };
  const options = request?.options;
  return <ConfirmContext.Provider value={confirm}><InputContext.Provider value={input}>
    {children}
    <AlertDialog open={request?.kind === "confirm"} onOpenChange={next => { if (!next) closeWith(false); }}>
      <AlertDialogContent onCloseAutoFocus={restoreFocus} className="max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{options?.title}</AlertDialogTitle>
          <AlertDialogDescription>{options?.description ?? "Confirma si deseas continuar con esta acción."}</AlertDialogDescription>
        </AlertDialogHeader>
        {options?.secondaryText && <p className="text-sm text-muted-foreground">{options.secondaryText}</p>}
        {options?.details && <details className="rounded-md border p-3 text-sm"><summary className="cursor-pointer font-medium">Ver detalles y consecuencias</summary><p className="mt-3 whitespace-pre-line">{options.details}</p></details>}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => closeWith(false)}>{options?.cancelText ?? "Cancelar"}</AlertDialogCancel>
          <AlertDialogAction className={options?.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined} onClick={() => closeWith(true)}>{options?.confirmText ?? "Confirmar"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <Dialog open={request?.kind === "input"} onOpenChange={next => { if (!next) closeWith(false); }}>
      <DialogContent onCloseAutoFocus={restoreFocus} className="max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-lg" onEscapeKeyDown={event => { if (submitting.current) event.preventDefault(); }} onPointerDownOutside={event => { if (submitting.current) event.preventDefault(); }}>
        <DialogHeader><DialogTitle>{options?.title}</DialogTitle><DialogDescription>{options?.description ?? "Introduce el valor y guarda los cambios."}</DialogDescription></DialogHeader>
        {request?.kind === "input" && <form onSubmit={submit} className="space-y-4" aria-busy={saving}>
          <div className="space-y-2"><Label htmlFor={id}>{request.options.label}</Label>
            <Input id={id} autoFocus value={text} inputMode={request.options.inputMode} disabled={saving} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} onChange={event => { setText(event.target.value); setError(null); }} />
            {error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => closeWith(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? "Guardando…" : options?.confirmText ?? "Guardar"}</Button></DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>
  </InputContext.Provider></ConfirmContext.Provider>;
}

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext) ?? (async () => false);
}
export function useDialogInput(): InputFn {
  return useContext(InputContext) ?? (async () => false);
}
