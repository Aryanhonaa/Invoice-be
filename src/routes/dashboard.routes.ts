import { Router } from "express";
import { Permissions } from "../config/permissions.js";
import { getDashboardController } from "../controllers/dashboard.controller.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requirePermission } from "../middleware/require-permission.js";
import { asyncHandler } from "../utils/async-handler.js";

const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get(
  "/",
  requirePermission(Permissions.REPORTS_VIEW),
  asyncHandler(getDashboardController),
);

export { dashboardRouter };
