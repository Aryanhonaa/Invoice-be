import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/repositories/user.repository.js", async () => {
  const { getTestRepos } = await import("./helpers/memory-db.js");
  return getTestRepos().user;
});
vi.mock("../src/repositories/session.repository.js", async () => {
  const { getTestRepos } = await import("./helpers/memory-db.js");
  return getTestRepos().session;
});
vi.mock("../src/repositories/organization.repository.js", async () => {
  const { getTestRepos } = await import("./helpers/memory-db.js");
  return getTestRepos().organization;
});
vi.mock("../src/repositories/team.repository.js", async () => {
  const { getTestRepos } = await import("./helpers/memory-db.js");
  return getTestRepos().team;
});
vi.mock("../src/repositories/audit.repository.js", async () => {
  const { getTestRepos } = await import("./helpers/memory-db.js");
  return getTestRepos().audit;
});
vi.mock("../src/repositories/health.repository.js", () => ({
  checkDatabaseConnection: vi.fn().mockResolvedValue(true),
}));

import { app } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import {
  getTestDb,
  resetMemoryDb,
  seedOrganization,
  seedUser,
} from "./helpers/memory-db.js";

const password = "CorrectHorse1";

describe("organization management", () => {
  beforeEach(() => {
    resetMemoryDb(getTestDb());
  });

  async function loginAs(email: string) {
    const response = await request(app).post("/api/auth/login").send({ email, password });
    expect(response.status).toBe(200);
    const cookies = response.headers["set-cookie"];
    if (!cookies) {
      throw new Error("Expected session cookie");
    }
    return Array.isArray(cookies) ? cookies : [cookies];
  }

  async function seedActors() {
    const db = getTestDb();
    const org = seedOrganization(db, { name: "Northwind", slug: "northwind" });
    const passwordHash = await hashPassword(password);

    seedUser(db, {
      email: "super@example.com",
      passwordHash,
      role: "SUPER_ADMIN",
    });
    seedUser(db, {
      email: "admin@example.com",
      passwordHash,
      role: "ADMIN",
      organizationId: org.id,
    });

    return { org };
  }

  it("allows Super Admin to create an organization", async () => {
    await seedActors();
    const cookies = await loginAs("super@example.com");

    const response = await request(app)
      .post("/api/organizations")
      .set("Cookie", cookies)
      .send({ name: "Acme Billing" });

    expect(response.status).toBe(201);
    expect(response.body.data.organization.name).toBe("Acme Billing");
    expect(response.body.data.organization.slug).toBe("acme-billing");
    expect(response.body.data.organization.isActive).toBe(true);
  });

  it("rejects duplicate slugs", async () => {
    await seedActors();
    const cookies = await loginAs("super@example.com");

    const response = await request(app)
      .post("/api/organizations")
      .set("Cookie", cookies)
      .send({ name: "Other", slug: "northwind" });

    expect(response.status).toBe(409);
  });

  it("does not allow an Admin to create an organization", async () => {
    await seedActors();
    const cookies = await loginAs("admin@example.com");

    const response = await request(app)
      .post("/api/organizations")
      .set("Cookie", cookies)
      .send({ name: "Shadow Org" });

    expect(response.status).toBe(403);
  });

  it("allows Super Admin to deactivate an organization and blocks its users", async () => {
    const { org } = await seedActors();
    const cookies = await loginAs("super@example.com");

    const response = await request(app)
      .patch(`/api/organizations/${org.id}/status`)
      .set("Cookie", cookies)
      .send({ isActive: false });

    expect(response.status).toBe(200);
    expect(response.body.data.organization.isActive).toBe(false);

    const login = await request(app).post("/api/auth/login").send({
      email: "admin@example.com",
      password,
    });
    expect(login.status).toBe(403);
  });

  it("lists organizations with high-level counts for Super Admin", async () => {
    const { org } = await seedActors();
    const cookies = await loginAs("super@example.com");

    const listed = await request(app).get("/api/organizations").set("Cookie", cookies);
    expect(listed.status).toBe(200);
    const item = listed.body.data.organizations.find((row: { id: string }) => row.id === org.id);
    expect(item.adminCount).toBe(1);
    expect(item.memberCount).toBe(0);
    expect(item.admin.email).toBe("admin@example.com");

    const detail = await request(app).get(`/api/organizations/${org.id}`).set("Cookie", cookies);
    expect(detail.status).toBe(200);
    expect(detail.body.data.organization.teamCount).toBe(0);
  });
});
