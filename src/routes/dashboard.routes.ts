import { Router } from "express";
import { getDashboardController } from "../controllers/dashboard.controller.js";
import { requireAuth } from "../middleware/require-auth.js";
import { asyncHandler } from "../utils/async-handler.js";

const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get("/", asyncHandler(getDashboardController));

export { dashboardRouter };
