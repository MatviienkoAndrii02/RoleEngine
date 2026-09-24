import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/server/errors";
import { assertUserHasWorkspaceRole, assertWorkspaceRoleMembership, getUserWorkspaces, requireCharacterGM, requireTemplateGM } from "@/server/authz";
import { deleteCharacterNode, updateCharacterNode } from "@/server/actions/characters";
import { deleteTemplateNode, updateTemplateNode } from "@/server/actions/templates";

const createdUserIds: string[] = [];
const createdWorkspaceIds: string[] = [];

describe("authz scope guards", () => {
  afterEach(async () => {
    if (createdWorkspaceIds.length) {
      await prisma.templateTag.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.auditLog.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.characterAssignment.deleteMany({ where: { character: { workspaceId: { in: createdWorkspaceIds } } } });
      await prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.character.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.entityTemplate.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.workspace.deleteMany({ where: { id: { in: createdWorkspaceIds } } });
      createdWorkspaceIds.length = 0;
    }

    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.length = 0;
    }
  });

  it("rejects a membership from a different workspace", () => {
    assert.throws(() => assertWorkspaceRoleMembership("workspace_a", null, ["OWNER", "GM"]), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, "FORBIDDEN");
      assert.equal(error.status, 403);
      return true;
    });

    assert.throws(() => assertWorkspaceRoleMembership("workspace_a", { workspaceId: "workspace_b", role: "GM", workspace: { archivedAt: null } }, ["OWNER", "GM"]), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, "FORBIDDEN");
      assert.equal(error.status, 403);
      return true;
    });
  });

  it("allows GM access when workspace membership matches the target workspace", () => {
    const membership = assertWorkspaceRoleMembership("workspace_a", { workspaceId: "workspace_a", role: "GM", workspace: { archivedAt: null } }, ["OWNER", "GM"]);
    assert.equal(membership.role, "GM");
    assert.equal(membership.workspaceId, "workspace_a");
  });

  it("rejects cross-workspace character access through the DB-backed scope check", async () => {
    const unique = Date.now().toString(36);
    const actor = await prisma.user.create({
      data: {
        email: `actor-${unique}@example.com`,
        username: `actor_${unique}`,
        usernameKey: `actor_${unique}`,
      },
    });
    createdUserIds.push(actor.id);
    const workspaceA = await prisma.workspace.create({ data: { name: `Workspace A ${unique}` } });
    const workspaceB = await prisma.workspace.create({ data: { name: `Workspace B ${unique}` } });
    createdWorkspaceIds.push(workspaceA.id, workspaceB.id);

    await prisma.workspaceMembership.create({
      data: { workspaceId: workspaceA.id, userId: actor.id, role: "OWNER" },
    });

    const character = await prisma.character.create({
      data: {
        workspaceId: workspaceA.id,
        name: "Alpha",
        createdById: actor.id,
      },
    });

    await assert.rejects(
      () => requireCharacterGM(character.id, { workspaceId: workspaceB.id }, { user: { id: actor.id } }),
      (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND",
    );

    await assert.rejects(
      () => assertUserHasWorkspaceRole(actor.id, workspaceB.id, ["OWNER", "GM"]),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "FORBIDDEN");
        assert.equal(error.status, 403);
        return true;
      },
    );

    const membership = await assertUserHasWorkspaceRole(actor.id, workspaceA.id, ["OWNER", "GM"]);
    assert.equal(membership.workspaceId, workspaceA.id);
    assert.equal(membership.role, "OWNER");
    assert.equal(character.id.length > 0, true);
  });

  it("rejects cross-workspace template access through the DB-backed scope check", async () => {
    const unique = Date.now().toString(36);
    const actor = await prisma.user.create({
      data: {
        email: `template-${unique}@example.com`,
        username: `template_${unique}`,
        usernameKey: `template_${unique}`,
      },
    });
    createdUserIds.push(actor.id);
    const workspaceA = await prisma.workspace.create({ data: { name: `Template Workspace A ${unique}` } });
    const workspaceB = await prisma.workspace.create({ data: { name: `Template Workspace B ${unique}` } });
    createdWorkspaceIds.push(workspaceA.id, workspaceB.id);

    await prisma.workspaceMembership.create({
      data: { workspaceId: workspaceA.id, userId: actor.id, role: "GM" },
    });

    const template = await prisma.entityTemplate.create({
      data: {
        workspaceId: workspaceA.id,
        kind: "CHARACTER",
        name: "Starter",
        isGlobal: false,
        createdById: actor.id,
      },
    });

    await assert.rejects(
      () => requireTemplateGM(template.id, { workspaceId: workspaceB.id }, { user: { id: actor.id } }),
      (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND",
    );

    await assert.rejects(
      () => assertUserHasWorkspaceRole(actor.id, workspaceB.id, ["OWNER", "GM"]),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "FORBIDDEN");
        assert.equal(error.status, 403);
        return true;
      },
    );

    const membership = await assertUserHasWorkspaceRole(actor.id, workspaceA.id, ["OWNER", "GM"]);
    assert.equal(membership.workspaceId, workspaceA.id);
    assert.equal(template.name, "Starter");
  });

  it("rejects PATCH and DELETE node mutations from another workspace", async () => {
    const unique = Date.now().toString(36);
    const owner = await prisma.user.create({
      data: {
        email: `owner-${unique}@example.com`,
        username: `owner_${unique}`,
        usernameKey: `owner_${unique}`,
      },
    });
    const intruder = await prisma.user.create({
      data: {
        email: `intruder-${unique}@example.com`,
        username: `intruder_${unique}`,
        usernameKey: `intruder_${unique}`,
      },
    });
    createdUserIds.push(owner.id, intruder.id);

    const workspaceA = await prisma.workspace.create({ data: { name: `Node Workspace A ${unique}` } });
    const workspaceB = await prisma.workspace.create({ data: { name: `Node Workspace B ${unique}` } });
    createdWorkspaceIds.push(workspaceA.id, workspaceB.id);

    await prisma.workspaceMembership.createMany({
      data: [
        { workspaceId: workspaceA.id, userId: owner.id, role: "OWNER" },
        { workspaceId: workspaceB.id, userId: intruder.id, role: "OWNER" },
      ],
    });

    const character = await prisma.character.create({
      data: {
        workspaceId: workspaceA.id,
        name: "Alpha",
        createdById: owner.id,
      },
    });

    const node = await prisma.characterNode.create({
      data: {
        characterId: character.id,
        type: "NUMBER",
        name: "Power",
        path: "power",
        data: { value: 10 },
      },
    });

    const session = { user: { id: intruder.id } };

    await assert.rejects(
      () => updateCharacterNode({ characterId: character.id, nodeId: node.id, name: "Hacked" }, session),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "FORBIDDEN");
        assert.equal(error.status, 403);
        return true;
      },
    );

    await assert.rejects(
      () => deleteCharacterNode({ characterId: character.id, nodeId: node.id }, session),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "FORBIDDEN");
        assert.equal(error.status, 403);
        return true;
      },
    );
  });

  it("rejects action mutations when a workspace member is only a PLAYER", async () => {
    const unique = Date.now().toString(36);
    const gm = await prisma.user.create({
      data: {
        email: `gm-${unique}@example.com`,
        username: `gm_${unique}`,
        usernameKey: `gm_${unique}`,
      },
    });
    const player = await prisma.user.create({
      data: {
        email: `player-${unique}@example.com`,
        username: `player_${unique}`,
        usernameKey: `player_${unique}`,
      },
    });
    createdUserIds.push(gm.id, player.id);

    const workspace = await prisma.workspace.create({ data: { name: `Player Role Workspace ${unique}` } });
    createdWorkspaceIds.push(workspace.id);

    await prisma.workspaceMembership.createMany({
      data: [
        { workspaceId: workspace.id, userId: gm.id, role: "OWNER" },
        { workspaceId: workspace.id, userId: player.id, role: "PLAYER" },
      ],
    });

    const character = await prisma.character.create({
      data: {
        workspaceId: workspace.id,
        name: "Shared Character",
        createdById: gm.id,
      },
    });

    const node = await prisma.characterNode.create({
      data: {
        characterId: character.id,
        type: "NUMBER",
        name: "Base",
        path: "base",
        data: { value: 5 },
      },
    });

    const playerSession = { user: { id: player.id } };

    await assert.rejects(
      () => updateCharacterNode({ characterId: character.id, nodeId: node.id, name: "Hacked" }, playerSession),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "FORBIDDEN");
        assert.equal(error.status, 403);
        return true;
      },
    );

    await assert.rejects(
      () => deleteCharacterNode({ characterId: character.id, nodeId: node.id }, playerSession),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "FORBIDDEN");
        assert.equal(error.status, 403);
        return true;
      },
    );
  });

  it("rejects PATCH and DELETE template node mutations from another workspace", async () => {
    const unique = Date.now().toString(36);
    const owner = await prisma.user.create({
      data: {
        email: `template-owner-${unique}@example.com`,
        username: `template_owner_${unique}`,
        usernameKey: `template_owner_${unique}`,
      },
    });
    const intruder = await prisma.user.create({
      data: {
        email: `template-intruder-${unique}@example.com`,
        username: `template_intruder_${unique}`,
        usernameKey: `template_intruder_${unique}`,
      },
    });
    createdUserIds.push(owner.id, intruder.id);

    const workspaceA = await prisma.workspace.create({ data: { name: `Template Node Workspace A ${unique}` } });
    const workspaceB = await prisma.workspace.create({ data: { name: `Template Node Workspace B ${unique}` } });
    createdWorkspaceIds.push(workspaceA.id, workspaceB.id);

    await prisma.workspaceMembership.createMany({
      data: [
        { workspaceId: workspaceA.id, userId: owner.id, role: "OWNER" },
        { workspaceId: workspaceB.id, userId: intruder.id, role: "OWNER" },
      ],
    });

    const template = await prisma.entityTemplate.create({
      data: {
        workspaceId: workspaceA.id,
        kind: "CHARACTER",
        name: "Node Template",
        isGlobal: false,
        createdById: owner.id,
      },
    });

    const node = await prisma.templateNode.create({
      data: {
        templateId: template.id,
        type: "NUMBER",
        name: "Power",
        path: "power",
        data: { value: 10 },
      },
    });

    const session = { user: { id: intruder.id } };

    await assert.rejects(
      () => updateTemplateNode({ templateId: template.id, nodeId: node.id, name: "Hacked" }, session),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "FORBIDDEN");
        assert.equal(error.status, 403);
        return true;
      },
    );

    await assert.rejects(
      () => deleteTemplateNode({ templateId: template.id, nodeId: node.id }, session),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "FORBIDDEN");
        assert.equal(error.status, 403);
        return true;
      },
    );
  });

  it("rejects multiple default character templates within one workspace", async () => {
    const unique = Date.now().toString(36);
    const actor = await prisma.user.create({
      data: {
        email: `default-${unique}@example.com`,
        username: `default_${unique}`,
        usernameKey: `default_${unique}`,
      },
    });
    createdUserIds.push(actor.id);

    const workspace = await prisma.workspace.create({ data: { name: `Default Template Workspace ${unique}` } });
    createdWorkspaceIds.push(workspace.id);

    await prisma.workspaceMembership.create({
      data: { workspaceId: workspace.id, userId: actor.id, role: "OWNER" },
    });

    await prisma.entityTemplate.create({
      data: {
        workspaceId: workspace.id,
        kind: "CHARACTER",
        name: "Default One",
        isGlobal: false,
        isDefaultCharacter: true,
        createdById: actor.id,
      },
    });

    await assert.rejects(
      () => prisma.entityTemplate.create({
        data: {
          workspaceId: workspace.id,
          kind: "CHARACTER",
          name: "Default Two",
          isGlobal: false,
          isDefaultCharacter: true,
          createdById: actor.id,
        },
      }),
      (error: unknown) => {
        assert.ok(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002");
        return true;
      },
    );
  });

  it("returns only the memberships that belong to the current user", async () => {
    const unique = Date.now().toString(36);
    const actor = await prisma.user.create({
      data: {
        email: `member-${unique}@example.com`,
        username: `member_${unique}`,
        usernameKey: `member_${unique}`,
      },
    });
    const stranger = await prisma.user.create({
      data: {
        email: `stranger-${unique}@example.com`,
        username: `stranger_${unique}`,
        usernameKey: `stranger_${unique}`,
      },
    });
    createdUserIds.push(actor.id, stranger.id);

    const workspaceA = await prisma.workspace.create({ data: { name: `Scope Workspace A ${unique}` } });
    const workspaceB = await prisma.workspace.create({ data: { name: `Scope Workspace B ${unique}` } });
    const workspaceC = await prisma.workspace.create({ data: { name: `Scope Workspace C ${unique}` } });
    createdWorkspaceIds.push(workspaceA.id, workspaceB.id, workspaceC.id);

    await prisma.workspaceMembership.createMany({
      data: [
        { workspaceId: workspaceA.id, userId: actor.id, role: "OWNER" },
        { workspaceId: workspaceB.id, userId: actor.id, role: "GM" },
        { workspaceId: workspaceC.id, userId: stranger.id, role: "OWNER" },
      ],
    });

    const memberships = await getUserWorkspaces(actor.id);
    assert.deepEqual(
      memberships.map((workspace) => workspace.id).sort(),
      [workspaceA.id, workspaceB.id].sort(),
    );
    assert.equal(memberships.every((workspace) => workspace.id !== workspaceC.id), true);
    assert.equal((await getUserWorkspaces(stranger.id)).map((workspace) => workspace.id).includes(workspaceC.id), true);
  });
});
