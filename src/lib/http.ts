import type { APIContext } from "astro";
import { ActionError } from "./actions";

export const IDENTITY_COOKIE = "demo_user";

// Forms post here and are redirected (303) back to the page they came from,
// so every action works without client-side JavaScript. Messages travel in
// the query string and are rendered as escaped text.
export function safeBack(value: FormDataEntryValue | null, fallback = "/"): string {
  const back = typeof value === "string" ? value : "";
  return back.startsWith("/") && !back.startsWith("//") ? back : fallback;
}

export function withMessage(path: string, key: "error" | "notice", message: string): string {
  const url = new URL(path, "http://local");
  url.searchParams.delete("error");
  url.searchParams.delete("notice");
  url.searchParams.set(key, message.slice(0, 300));
  return `${url.pathname}${url.search}${url.hash}`;
}

export async function runAction(
  context: APIContext,
  action: (form: FormData) => { to?: string; notice?: string } | void,
): Promise<Response> {
  const form = await context.request.formData();
  const back = safeBack(form.get("back"));
  try {
    const result = action(form) ?? {};
    const to = result.to ?? back;
    return context.redirect(result.notice ? withMessage(to, "notice", result.notice) : to, 303);
  } catch (error) {
    if (error instanceof ActionError) {
      return context.redirect(withMessage(back, "error", error.message), 303);
    }
    throw error;
  }
}

export function int(form: FormData, key: string): number {
  const value = Number(form.get(key));
  return Number.isFinite(value) ? Math.trunc(value) : Number.NaN;
}

export function str(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}
