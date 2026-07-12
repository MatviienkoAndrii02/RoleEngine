import { z } from "zod";
import { apiErrorResponse, AppError } from "@/server/errors";

export async function parseJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiInputError("INVALID_JSON", "Request body must be valid JSON");
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiInputError("VALIDATION_FAILED", "Request validation failed", result.error.flatten());
  }
  return result.data;
}

export class ApiInputError extends AppError {
  constructor(code: "INVALID_JSON" | "VALIDATION_FAILED", message: string, details?: unknown) {
    super(code, message, 400, details);
    this.name = "ApiInputError";
  }
}

export function inputErrorResponse(error: unknown) {
  return apiErrorResponse(error);
}
