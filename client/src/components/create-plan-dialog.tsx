import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPlanSchema, type InsertPlan } from "@shared/schema";
import { useCreatePlan } from "@/hooks/use-plans";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { api } from "@shared/routes";
import { planDefaultsForNewDay, type PlanCreationDefaults } from "@/lib/plan-creation-defaults";

const emptyForm: InsertPlan = {
  date: "", workStart: "", workEnd: "", mealStart: "", mealEnd: "",
  mealMode: "flexible_meal_window", contestantMealDurationMinutes: 75,
  contestantMealMaxSimultaneous: 10, camerasAvailable: 0, status: "draft",
};

export function CreatePlanDialog() {
  const [open, setOpen] = useState(false);
  const [overrideWork,setOverrideWork]=useState(false);
  const [overrideMeal,setOverrideMeal]=useState(false);
  const createPlan = useCreatePlan();
  const defaultsQuery = useQuery<PlanCreationDefaults>({
    queryKey: [api.programSettings.get.path],
    queryFn: () => apiRequest("GET", api.programSettings.get.path),
  });
  const form = useForm<InsertPlan>({ resolver: zodResolver(insertPlanSchema), defaultValues: emptyForm });

  useEffect(() => {
    if (open && defaultsQuery.data) form.reset(planDefaultsForNewDay(defaultsQuery.data));
  }, [open, defaultsQuery.data, form]);

  function onSubmit(data: InsertPlan) {
    const {workStart,workEnd,mealStart,mealEnd,mealMode,...ordinary}=data;
    createPlan.mutate({...ordinary,configuration:{
      workday:overrideWork?{intent:"OVERRIDE",value:{start:workStart,end:workEnd}}:{intent:"INHERIT"},
      meal:overrideMeal?{intent:"OVERRIDE",value:{start:mealStart,end:mealEnd,mode:mealMode === "global_hard_break" ? "global_hard_break" : "flexible_meal_window"}}:{intent:"INHERIT"},
    }}, { onSuccess: () => { setOpen(false); setOverrideWork(false); setOverrideMeal(false); form.reset(emptyForm); } });
  }

  const unavailable = defaultsQuery.isError || (!defaultsQuery.isLoading && !defaultsQuery.data);
  return <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) void defaultsQuery.refetch(); }}>
    <DialogTrigger asChild><Button className="gap-2 shadow-lg hover:shadow-primary/25 transition-all"><Plus className="h-4 w-4" aria-hidden />Crear día</Button></DialogTrigger>
    <DialogContent className="sm:max-w-[425px]" aria-describedby="create-plan-description">
      <DialogHeader><DialogTitle>Crear nuevo día</DialogTitle><DialogDescription id="create-plan-description">Parte del horario habitual y modifica aquí únicamente las excepciones de este día.</DialogDescription></DialogHeader>
      {defaultsQuery.isLoading || defaultsQuery.isFetching
        ? <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Cargando el horario habitual…</p>
        : unavailable
          ? <div role="alert" className="rounded-md border border-destructive p-3 text-sm"><p>No se pudo cargar el horario habitual. No se creará el día con horas supuestas.</p><Button type="button" variant="outline" className="mt-2" onClick={() => void defaultsQuery.refetch()}>Reintentar</Button></div>
          : <Form {...form}><form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="date" render={({field}) => <FormItem><FormLabel>Fecha</FormLabel><FormControl><Input type="date" {...field}/></FormControl><FormMessage/></FormItem>}/>
            <fieldset><legend className="mb-2 text-sm font-medium">Horario de este día</legend><p className="mb-3 text-xs text-muted-foreground">{overrideWork?"Modificar sólo para este día":"Usar configuración habitual"}</p><Button type="button" variant="outline" size="sm" className="mb-3" onClick={()=>setOverrideWork(v=>!v)}>{overrideWork?"Usar configuración habitual":"Modificar sólo para este día"}</Button><div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="workStart" render={({field}) => <FormItem><FormLabel>Inicio</FormLabel><FormControl><Input type="time" disabled={!overrideWork} {...field}/></FormControl><FormMessage/></FormItem>}/>
              <FormField control={form.control} name="workEnd" render={({field}) => <FormItem><FormLabel>Fin</FormLabel><FormControl><Input type="time" disabled={!overrideWork} {...field}/></FormControl><FormMessage/></FormItem>}/>
            </div></fieldset>
            <div><p className="mb-2 text-xs text-muted-foreground">{overrideMeal?"Comida modificada sólo para este día":"Comida habitual"}</p><Button type="button" variant="outline" size="sm" className="mb-3" onClick={()=>setOverrideMeal(v=>!v)}>{overrideMeal?"Usar configuración habitual":"Modificar sólo para este día"}</Button></div>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="mealStart" render={({field}) => <FormItem><FormLabel>Inicio de comida</FormLabel><FormControl><Input type="time" disabled={!overrideMeal} {...field}/></FormControl><FormMessage/></FormItem>}/>
              <FormField control={form.control} name="mealEnd" render={({field}) => <FormItem><FormLabel>Fin de comida</FormLabel><FormControl><Input type="time" disabled={!overrideMeal} {...field}/></FormControl><FormMessage/></FormItem>}/>
            </div>
            <FormField control={form.control} name="mealMode" render={({field}) => <FormItem><FormLabel>Modo de comida</FormLabel><FormControl><select aria-label="Modo de comida" disabled={!overrideMeal} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50" {...field}><option value="flexible_meal_window">Ventana flexible de comida</option><option value="global_hard_break">Parada global de comida</option></select></FormControl><FormMessage/></FormItem>}/>
            <Button type="submit" className="w-full" disabled={createPlan.isPending}>{createPlan.isPending ? "Creando…" : "Crear día"}</Button>
          </form></Form>}
    </DialogContent>
  </Dialog>;
}
