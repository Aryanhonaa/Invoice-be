import { Router } from "express";
import {
  loginController,
  logoutController,
  meController,
} from "../controllers/auth.controller.js";
import { loginRateLimit } from "../middleware/login-rate-limit.js";
import { requireAuth } from "../middleware/require-auth.js";
import { asyncHandler } from "../utils/async-handler.js";

const authRouter = Router();

authRouter.post("/login", loginRateLimit, asyncHandler(loginController));
authRouter.post("/logout", requireAuth, asyncHandler(logoutController));
authRouter.get("/me", requireAuth, asyncHandler(meController));

export { authRouter };
