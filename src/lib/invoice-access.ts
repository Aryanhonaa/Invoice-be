import { ForbiddenError } from "./errors.js";
import { listTeamsForUser } from "../repositories/team.repository.js";
import type { AuthUser } from "../types/auth.js";

export interface InvoiceAccessTarget {
  organizationId: string;
  createdById: string;
  assignedMemberId: string | null;
  assignedTeamId: string | null;
}

export async function assertInvoiceAccess(
  actor: AuthUser,
  invoice: InvoiceAccessTarget,
): Promise<void> {
  if (actor.role === "SUPER_ADMIN") {
    return;
  }
  if (actor.organizationId !== invoice.organizationId) {
    throw new ForbiddenError("You do not have access to this organization");
  }
  if (actor.role === "ADMIN") {
    return;
  }

  const teams = await listTeamsForUser(actor.id);
  const teamIds = teams.map((team) => team.id);
  const allowed =
    invoice.createdById === actor.id ||
    invoice.assignedMemberId === actor.id ||
    (invoice.assignedTeamId !== null && teamIds.includes(invoice.assignedTeamId));

  if (!allowed) {
    throw new ForbiddenError("You do not have access to this invoice");
  }
}
