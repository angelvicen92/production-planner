import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertDailyTaskSchema, type InsertDailyTask } from "@shared/schema";
import {
  useCreateDailyTask,
  useTaskTemplates,
  useContestants,
} from "@/hooks/use-tasks";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { PlusCircle, Loader2 } from "lucide-react";

interface AddTaskDialogProps {
  planId: number;
  contestantId?: number | null; // si viene, la tarea se crea ya asignada
}

export function AddTaskDialog({
  planId,
  contestantId,
}: {
  planId: number;
  contestantId?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const createTask = useCreateDailyTask();
  const {
    data: templates,
    isLoading: loadingTemplates,
    error: templatesError,
  } = useTaskTemplates();
  const { data: contestants = [] } = useContestants(planId);

  const form = useForm<InsertDailyTask>({
    resolver: zodResolver(insertDailyTaskSchema),
    defaultValues: {
      planId,
      status: "pending",
      contestantId: contestantId ?? undefined,
    },
  });

  function onSubmit(data: InsertDailyTask) {
    createTask.mutate(data, {
      onSuccess: () => {
        setOpen(false);
        form.reset({
          planId,
          status: "pending",
          contestantId: contestantId ?? undefined,
        });
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <PlusCircle className="h-4 w-4" />
          Add Task
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Task to Plan</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="templateId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Task Template</FormLabel>
                  <Select
                    onValueChange={(val) => field.onChange(parseInt(val))}
                    value={field.value?.toString()}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a template" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {loadingTemplates ? (
                        <div className="p-2 flex justify-center">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                      ) : templatesError ? (
                        <div className="p-2 text-sm">
                          <div className="font-medium">
                            No se pudieron cargar las plantillas
                          </div>
                          <div className="text-muted-foreground mt-1">
                            {(templatesError as any)?.message ||
                              "Error desconocido"}
                          </div>
                        </div>
                      ) : (templates?.length ?? 0) === 0 ? (
                        <div className="p-2 text-sm text-muted-foreground">
                          No hay plantillas en la base de datos
                          (task_templates).
                        </div>
                      ) : (
                        templates!.map((t) => (
                          <SelectItem key={t.id} value={t.id.toString()}>
                            {t.name} ({t.defaultDuration}min)
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="durationOverride"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Minutes"
                        {...field}
                        value={field.value || ""}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value
                              ? parseInt(e.target.value)
                              : undefined,
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="camerasOverride"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cameras (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        value={field.value || ""}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value
                              ? parseInt(e.target.value)
                              : undefined,
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {contestantId ? (
              <div className="text-sm text-muted-foreground">
                Concursante fijado (desde ficha)
              </div>
            ) : (
              <FormField
                control={form.control}
                name="contestantId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Concursante (opcional)</FormLabel>
                    <Select
                      onValueChange={(val) => field.onChange(parseInt(val))}
                      value={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Sin concursante" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {contestants.map((c: any) => (
                          <SelectItem key={c.id} value={c.id.toString()}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={createTask.isPending}
            >
              {createTask.isPending ? "Adding..." : "Add Task"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
