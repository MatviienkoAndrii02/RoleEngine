import { redirect } from "next/navigation";
import { auth } from "@/auth";

export async function requirePageUser(callbackUrl: string) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }
  return session.user;
}

export async function requirePageGM(callbackUrl: string) {
  return requirePageUser(callbackUrl);
}
