import { revalidatePath } from "next/cache";

export function safeRevalidatePath(path: string): void {
  let thrown: unknown = undefined;
  try {
    revalidatePath(path);
  } catch (error) {
    thrown = error;
  }
  if (!thrown) return;
  // Outside a Next.js server action/route, revalidatePath throws
  // "static generation store missing". The callers already persist
  // mutation + audit + derived state transactionally, so a dropped
  // static revalidation is non-fatal in tests/raw usage and should not
  // roll back the whole mutation.
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  if (message.includes("static generation store missing")) return;
  throw thrown;
}
