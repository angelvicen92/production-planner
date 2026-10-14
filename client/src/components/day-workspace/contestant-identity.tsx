export function ContestantIdentity({name}:{name:string}) {
  return <section className="space-y-1 rounded-lg border bg-muted/20 p-3"><h3 className="text-sm font-semibold">Identidad y datos</h3><p className="font-medium">{name}</p><p className="text-xs text-muted-foreground">El nombre se fija al crear el concursante. En esta ficha puedes modificar su canción, disponibilidad y datos operativos.</p></section>;
}
