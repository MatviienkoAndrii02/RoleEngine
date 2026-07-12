import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { registerAccountCommandSchema } from "@/domain/validation";
import { inputErrorResponse, parseJson } from "@/server/api-validation";
import { appError } from "@/server/errors";

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, registerAccountCommandSchema);
    const usernameKey = input.username.toLowerCase();
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: input.email },
          { usernameKey },
        ],
      },
      select: { email: true, usernameKey: true },
    });

    if (existingUser) {
      throw existingUser.email === input.email
        ? appError("EMAIL_ALREADY_REGISTERED", "An account with this email already exists", 409)
        : appError("USERNAME_ALREADY_REGISTERED", "An account with this username already exists", 409);
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await prisma.user.create({
      data: {
        email: input.email,
        username: input.username,
        usernameKey,
        name: input.name || null,
        passwordHash,
      },
      select: { id: true, email: true, username: true, name: true },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    const uniqueAccountField = uniqueAccountFieldFromError(error);
    if (uniqueAccountField === "email") {
      return inputErrorResponse(appError("EMAIL_ALREADY_REGISTERED", "An account with this email already exists", 409));
    }
    if (uniqueAccountField === "username" || uniqueAccountField === "usernameKey") {
      return inputErrorResponse(appError("USERNAME_ALREADY_REGISTERED", "An account with this username already exists", 409));
    }
    return inputErrorResponse(error);
  }
}

function uniqueAccountFieldFromError(error: unknown): "email" | "username" | "usernameKey" | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  const maybePrismaError = error as { code?: unknown; meta?: { target?: unknown } };
  if (maybePrismaError.code !== "P2002") return null;
  const target = maybePrismaError.meta?.target;
  if (Array.isArray(target) && target.includes("email")) return "email";
  if (Array.isArray(target) && target.includes("username")) return "username";
  if (Array.isArray(target) && target.includes("usernameKey")) return "usernameKey";
  if (target === "email") return "email";
  if (target === "username") return "username";
  if (target === "usernameKey") return "usernameKey";
  return null;
}
