import { NextResponse } from "next/server";

import { emailVerificationConfirmSchema } from "@/domain/validation";
import { verifyEmailWithToken } from "@/server/actions/account";
import { inputErrorResponse, parseJson } from "@/server/api-validation";

export async function POST(request: Request) {
  try {
    const { token } = await parseJson(request, emailVerificationConfirmSchema);
    const result = await verifyEmailWithToken(token);
    return NextResponse.json({ ok: true, verifiedAt: result.verifiedAt.toISOString() });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
