import { NextResponse } from "next/server";
import { passwordResetConfirmSchema } from "@/domain/validation";
import { resetPasswordWithToken } from "@/server/actions/account";
import { inputErrorResponse, parseJson } from "@/server/api-validation";

export async function POST(request: Request) {
  try {
    const body = await parseJson(request, passwordResetConfirmSchema);
    return NextResponse.json(await resetPasswordWithToken(body.token, body.newPassword));
  } catch (error) {
    return inputErrorResponse(error);
  }
}
