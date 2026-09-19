import { NextResponse } from "next/server";
import { passwordResetRequestSchema } from "@/domain/validation";
import { requestPasswordReset } from "@/server/actions/account";
import { inputErrorResponse, parseJson } from "@/server/api-validation";

export async function POST(request: Request) {
  try {
    const { identifier } = await parseJson(request, passwordResetRequestSchema);
    const result = await requestPasswordReset(identifier);
    return NextResponse.json({
      ok: true,
      ...(process.env.NODE_ENV === "development" && result.resetToken ? { resetToken: result.resetToken } : {}),
    });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
