import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPlanSchema, type InsertPlan } from "@shared/schema";
import { useCreatePlan } from "@/hooks/use-plans";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { api } from "@shared/routes";

export function CreatePlanDialog() {
  const [open, setOpen] = useState(false);
  const createPlan = useCreatePlan();
  
  const { data: defaults } = useQuery({
    queryKey: [api.programSettings.get.path],
    queryFn: () => apiRequest("GET", api.programSettings.get.path),
  });

  const baseDefaults: InsertPlan = {
    date: new Date().toISOString().split("T")[0],
    workStart: "09:00",
    workEnd: "18:00",
    mealStart: (defaults as any)?.mealStart ?? "13:00",
    mealEnd: (defaults as any)?.mealEnd ?? "16:00",
    contestantMealDurationMinutes:
      (defaults as any)?.contestantMealDurationMinutes ?? 75,
    contestantMealMaxSimultaneous:
      (defaults as any)?.contestantMealMaxSimultaneous ?? 10,
    camerasAvailable: 0,
    status: "draft",
  };

  const form = useForm<InsertPlan>({
    resolver: zodResolver(insertPlanSchema),
    defaultValues: baseDefaults,
  });

  function onSubmit(data: InsertPlan) {
    createPlan.mutate(data, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
      },
    });
  }

  return (
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            // Al abrir, aplicar defaults actuales (por si cambiaron en Settings)
            form.reset({
              date: new Date().toISOString().split("T")[0],
              workStart: "09:00",
              workEnd: "18:00",
              mealStart: (defaults as any)?.mealStart ?? "13:00",
              mealEnd: (defaults as any)?.mealEnd ?? "16:00",
              contestantMealDurationMinutes:
                (defaults as any)?.contestantMealDurationMinutes ?? 75,
              contestantMealMaxSimultaneous:
                (defaults as any)?.contestantMealMaxSimultaneous ?? 10,
              camerasAvailable: 0,
              status: "draft",
            });
          }
        }}
      >
      <DialogTrigger asChild>
        <Button className="gap-2 shadow-lg hover:shadow-primary/25 transition-all">
          <Plus className="h-4 w-4" />
          Create Plan
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Plan</DialogTitle>
          <DialogDescription>
            Set up the basic constraints for the daily schedule.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="workStart"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="workEnd"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="mealStart"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Meal Start</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="mealEnd"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Meal End</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Button 
              type="submit" 
              className="w-full"
              disabled={createPlan.isPending}
            >
              {createPlan.isPending ? "Creating..." : "Create Plan"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
