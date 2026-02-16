export function AccessDenied() {
  return (
    <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
      <h2 className="text-lg font-semibold text-destructive">Acceso denegado</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        No tienes permisos para acceder a esta sección.
      </p>
    </div>
  );
}
