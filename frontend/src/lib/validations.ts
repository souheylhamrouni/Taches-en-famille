import { z } from "zod";

export const taskSchema = z.object({
  title: z.string().min(2, "Le titre doit faire au moins 2 caractères").max(100, "Titre trop long"),
  points_worth: z.coerce.number().int().min(1, "Points minimum : 1").max(9999, "Points maximum : 9999"),
  penalty_points: z.coerce.number().int().min(0, "Pénalité minimum : 0").max(9999, "Pénalité maximum : 9999"),
  frequency: z.enum(["daily", "weekly", "once"]),
  photo_required: z.boolean(),
  assigned_to: z.array(z.string()).optional(),
});

export const rewardSchema = z.object({
  title: z.string().min(2, "Le titre doit faire au moins 2 caractères").max(100, "Titre trop long"),
  point_cost: z.coerce.number().int().min(1, "Coût minimum : 1").max(99999, "Coût maximum : 99999"),
  icon: z.string().max(10, "Icône invalide").optional(),
});

export type TaskInput = z.infer<typeof taskSchema>;
export type RewardInput = z.infer<typeof rewardSchema>;
