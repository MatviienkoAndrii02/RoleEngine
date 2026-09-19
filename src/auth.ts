import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_LOCKOUT_MS = 10 * 60 * 1000;
const loginFailureState = new Map<string, { count: number; lockedUntil: number }>();

export function normalizeLoginIdentifier(value: string) {
  return value.trim().toLowerCase();
}

export function isLoginLocked(identifier: string) {
  const key = normalizeLoginIdentifier(identifier);
  const state = loginFailureState.get(key);
  if (!state || state.lockedUntil <= 0) return false;
  if (Date.now() > state.lockedUntil) {
    loginFailureState.delete(key);
    return false;
  }
  return true;
}

export function registerFailedLoginAttempt(identifier: string) {
  const key = normalizeLoginIdentifier(identifier);
  const now = Date.now();
  const current = loginFailureState.get(key);

  if (current && current.lockedUntil > 0 && now > current.lockedUntil) {
    loginFailureState.delete(key);
  }

  const nextState = loginFailureState.get(key) ?? { count: 0, lockedUntil: 0 };
  nextState.count += 1;

  if (nextState.count >= LOGIN_FAILURE_LIMIT) {
    nextState.lockedUntil = now + LOGIN_LOCKOUT_MS;
    loginFailureState.set(key, nextState);
    return true;
  }

  loginFailureState.set(key, nextState);
  return false;
}

export function clearLoginFailureState(identifier: string) {
  loginFailureState.delete(normalizeLoginIdentifier(identifier));
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        identifier: {},
        password: {}
      },
      authorize: async (credentials) => {
        const identifier = normalizeLoginIdentifier(String(credentials?.identifier ?? ""));
        const password = String(credentials?.password ?? "").trim();

        if (!identifier || isLoginLocked(identifier)) {
          return null;
        }

        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { email: identifier },
              { usernameKey: identifier },
            ],
          },
        });

        if (!user?.passwordHash) {
          registerFailedLoginAttempt(identifier);
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          registerFailedLoginAttempt(identifier);
          return null;
        }

        clearLoginFailureState(identifier);
        return { id: user.id, email: user.email, name: user.name };
      }
    })
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
      }
      return session;
    }
  }
});
