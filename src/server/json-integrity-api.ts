import { NextResponse } from "next/server";
import type { JsonIntegrityApplyResult, JsonIntegrityReport, JsonIntegrityScope } from "@/domain/json-integrity";
import { jsonIntegrityCommandSchema } from "@/domain/validation";
import { inputErrorResponse, parseJson } from "@/server/api-validation";
import { requireCharacterGM, requireTemplateGM } from "@/server/authz";
import {
  applyJsonIntegrityPolicy,
  getJsonIntegrityReport,
  resolveJsonIntegrityEntry,
} from "@/server/json-integrity";

export type JsonIntegrityApiDeps = {
  authorize: (scope: JsonIntegrityScope) => Promise<{ id: string }>;
  report: (scope: JsonIntegrityScope) => Promise<JsonIntegrityReport>;
  apply: (scope: JsonIntegrityScope, actorId: string, action: "repair" | "quarantine") => Promise<JsonIntegrityApplyResult>;
  resolve: (input: { entryId: string; resolution: "repair" | "release" }, actorId: string) => Promise<JsonIntegrityReport>;
};

export const jsonIntegrityApiDeps: JsonIntegrityApiDeps = {
  authorize: async (scope) => {
    if (scope.kind === "character") return (await requireCharacterGM(scope.characterId)).user;
    return (await requireTemplateGM(scope.templateId)).user;
  },
  report: (scope) => getJsonIntegrityReport(scope),
  apply: (scope, actorId, action) => applyJsonIntegrityPolicy(scope, actorId, action),
  resolve: (input, actorId) => resolveJsonIntegrityEntry(input, actorId),
};

export async function jsonIntegrityGetResponse(
  scope: JsonIntegrityScope,
  deps: JsonIntegrityApiDeps = jsonIntegrityApiDeps,
) {
  try {
    await deps.authorize(scope);
    return NextResponse.json(await deps.report(scope));
  } catch (error) {
    return inputErrorResponse(error);
  }
}

export async function jsonIntegrityPostResponse(
  scope: JsonIntegrityScope,
  request: Request,
  deps: JsonIntegrityApiDeps = jsonIntegrityApiDeps,
) {
  try {
    const actor = await deps.authorize(scope);
    const command = await parseJson(request, jsonIntegrityCommandSchema);
    if (command.action === "resolve") {
      return NextResponse.json(await deps.resolve({ entryId: command.entryId, resolution: command.resolution }, actor.id));
    }
    return NextResponse.json(await deps.apply(scope, actor.id, command.action));
  } catch (error) {
    return inputErrorResponse(error);
  }
}
