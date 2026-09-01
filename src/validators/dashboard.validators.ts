import { z } from "zod";
import { DATE_PRESETS } from "../lib/date-range.js";

export const dashboardQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  preset: z.enum(DATE_PRESETS).default("this_year"),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});
