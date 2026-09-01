import type { AuthUser, TeamRecord } from "./auth.js";

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      authorizedTeam?: TeamRecord;
    }
  }
}

export {};
