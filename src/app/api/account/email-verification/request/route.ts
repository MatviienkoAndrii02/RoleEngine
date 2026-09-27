import { NextResponse } from "next/server";

import { getLanguage } from "@/i18n/server";
import { requestEmailVerification } from "@/server/actions/account";
import { inputErrorResponse } from "@/server/api-validation";

export async function POST() {
  try {
    const result = await requestEmailVerification(await getLanguage());
    return NextResponse.json({
      ok: true,
      alreadyVerified: result.alreadyVerified,
      ...(process.env.NODE_ENV === "development" && result.verificationToken
        ? { verificationToken: result.verificationToken }
        : {}),
    });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
