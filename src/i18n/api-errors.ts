import type { TranslationKey } from "@/i18n/translations";

type Translator = (key: TranslationKey, params?: Record<string, string | number>) => string;

type ApiErrorPayload = {
  error?: unknown;
  message?: unknown;
  details?: unknown;
};

const apiErrorKeys = {
  BAD_REQUEST: "apiError.BAD_REQUEST",
  CHARACTER_NAME_REQUIRED: "apiError.CHARACTER_NAME_REQUIRED",
  DEFAULT_TEMPLATE_KIND_INVALID: "apiError.DEFAULT_TEMPLATE_KIND_INVALID",
  DEPENDENCY_CYCLE: "apiError.DEPENDENCY_CYCLE",
  EFFECT_CONDITION_REQUIRED: "apiError.EFFECT_CONDITION_REQUIRED",
  EMAIL_ALREADY_REGISTERED: "apiError.EMAIL_ALREADY_REGISTERED",
  EFFECT_NAME_REQUIRED: "apiError.EFFECT_NAME_REQUIRED",
  EFFECT_OPERATION_REQUIRED: "apiError.EFFECT_OPERATION_REQUIRED",
  EFFECT_SCOPE_REQUIRED: "apiError.EFFECT_SCOPE_REQUIRED",
  FORBIDDEN: "apiError.FORBIDDEN",
  INVALID_JSON: "apiError.INVALID_JSON",
  NODE_NAME_REQUIRED: "apiError.NODE_NAME_REQUIRED",
  NOT_FOUND: "apiError.NOT_FOUND",
  NUMERIC_SOURCE_CONDITION_REQUIRED: "apiError.NUMERIC_SOURCE_CONDITION_REQUIRED",
  NUMERIC_TARGET_REQUIRED: "apiError.NUMERIC_TARGET_REQUIRED",
  PATCH_TARGET_REQUIRED: "apiError.PATCH_TARGET_REQUIRED",
  STRUCTURAL_RECONCILE_FAILED: "apiError.STRUCTURAL_RECONCILE_FAILED",
  STRUCTURAL_TARGET_INVALID: "apiError.STRUCTURAL_TARGET_INVALID",
  TEMPLATE_NAME_REQUIRED: "apiError.TEMPLATE_NAME_REQUIRED",
  TEMPLATE_NOT_FOUND: "apiError.TEMPLATE_NOT_FOUND",
  UNAUTHORIZED: "apiError.UNAUTHORIZED",
  UNKNOWN_ERROR: "apiError.UNKNOWN_ERROR",
  UNSUPPORTED_OPERATION: "apiError.UNSUPPORTED_OPERATION",
  USERNAME_ALREADY_REGISTERED: "apiError.USERNAME_ALREADY_REGISTERED",
  VALIDATION_FAILED: "apiError.VALIDATION_FAILED",
} as const satisfies Record<string, TranslationKey>;

export async function localizedApiError(response: Response, t: Translator, fallbackKey: TranslationKey) {
  const payload = await response.json().catch((): ApiErrorPayload => ({}));
  return apiErrorMessage(payload, t, fallbackKey);
}

export function apiErrorMessage(payload: ApiErrorPayload, t: Translator, fallbackKey: TranslationKey) {
  const code = typeof payload.error === "string" ? payload.error : "";
  const key = apiErrorKeys[code as keyof typeof apiErrorKeys];
  return key ? t(key) : t(fallbackKey);
}
