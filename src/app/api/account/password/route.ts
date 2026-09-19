import { NextResponse } from "next/server";
import { z } from "zod";
import { changePassword } from "@/server/actions/account";
import { parseJson, inputErrorResponse } from "@/server/api-validation";

const changePasswordSchema = z.object({
  currentPassword: z.string().trim().min(1, "Current password is required"),
  newPassword: z.string().trim().min(8, "New password must be at least 8 characters").max(200),
}).strict();

export async function PATCH(request: Request) {
  try {
    const body = await parseJson(request, changePasswordSchema);
    const result = await changePassword(body);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
