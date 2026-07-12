import { NextResponse } from "next/server";
import { z } from "zod";

export const apiErrorCodes = [
  "BAD_REQUEST",
  "CHARACTER_NAME_REQUIRED",
  "DEFAULT_TEMPLATE_KIND_INVALID",
  "DEPENDENCY_CYCLE",
  "EFFECT_CONDITION_REQUIRED",
  "EMAIL_ALREADY_REGISTERED",
  "EFFECT_NAME_REQUIRED",
  "EFFECT_OPERATION_REQUIRED",
  "EFFECT_SCOPE_REQUIRED",
  "FORBIDDEN",
  "INVALID_JSON",
  "NODE_NAME_REQUIRED",
  "NOT_FOUND",
  "NUMERIC_SOURCE_CONDITION_REQUIRED",
  "NUMERIC_TARGET_REQUIRED",
  "PATCH_TARGET_REQUIRED",
  "STRUCTURAL_RECONCILE_FAILED",
  "STRUCTURAL_TARGET_INVALID",
  "TEMPLATE_NAME_REQUIRED",
  "TEMPLATE_NOT_FOUND",
  "UNAUTHORIZED",
  "UNKNOWN_ERROR",
  "UNSUPPORTED_OPERATION",
  "USERNAME_ALREADY_REGISTERED",
  "VALIDATION_FAILED",
] as const;

export type ApiErrorCode = (typeof apiErrorCodes)[number];

export type ApiErrorBody = {
  error: ApiErrorCode;
  message: string;
  details?: unknown;
};

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function appError(code: ApiErrorCode, message: string, status = 400, details?: unknown) {
  return new AppError(code, message, status, details);
}

export function unauthorized() {
  return appError("UNAUTHORIZED", "Authentication is required", 401);
}

export function forbidden() {
  return appError("FORBIDDEN", "You do not have permission to perform this action", 403);
}

export function apiErrorResponse(error: unknown) {
  const normalized = normalizeApiError(error);
  const body: ApiErrorBody = {
    error: normalized.code,
    message: normalized.message,
    ...(normalized.details === undefined ? {} : { details: normalized.details }),
  };
  return NextResponse.json(body, { status: normalized.status });
}

export function normalizeApiError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof z.ZodError) {
    return appError("VALIDATION_FAILED", "Request validation failed", 400, error.flatten());
  }

  if (isPrismaNotFound(error)) {
    return appError("NOT_FOUND", "Requested entity was not found", 404);
  }

  if (error instanceof Error) {
    const legacy = legacyErrorByMessage(error.message);
    if (legacy) return legacy;
  }

  return appError("UNKNOWN_ERROR", "Unexpected server error", 500);
}

function isPrismaNotFound(error: unknown) {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === "P2025";
}

function legacyErrorByMessage(message: string): AppError | null {
  const exact: Partial<Record<string, AppError>> = {
    Unauthorized: unauthorized(),
    Forbidden: forbidden(),
    "Character name is required": appError("CHARACTER_NAME_REQUIRED", message),
    "Template name is required": appError("TEMPLATE_NAME_REQUIRED", message),
    "Node name is required": appError("NODE_NAME_REQUIRED", message),
    "Effect name is required": appError("EFFECT_NAME_REQUIRED", message),
    "Only a character template can be the default": appError("DEFAULT_TEMPLATE_KIND_INVALID", message),
    "Unsupported numeric operation": appError("UNSUPPORTED_OPERATION", message),
    "Numeric target is required": appError("NUMERIC_TARGET_REQUIRED", message),
    "Effect creates a dependency cycle": appError("DEPENDENCY_CYCLE", message, 409),
    "Patch target is required": appError("PATCH_TARGET_REQUIRED", message),
    "Structural effects did not reach a stable state": appError("STRUCTURAL_RECONCILE_FAILED", message, 409),
    "Template not found": appError("TEMPLATE_NOT_FOUND", message, 404),
    "Effect scope is required": appError("EFFECT_SCOPE_REQUIRED", message),
    "Effect operation is required": appError("EFFECT_OPERATION_REQUIRED", message),
    "Numeric source and condition are required": appError("NUMERIC_SOURCE_CONDITION_REQUIRED", message),
    "Effect condition is required": appError("EFFECT_CONDITION_REQUIRED", message),
  };

  if (exact[message]) return exact[message] ?? null;
  if (message.startsWith("Structural nodes can only be created")) {
    return appError("STRUCTURAL_TARGET_INVALID", message);
  }
  return null;
}
