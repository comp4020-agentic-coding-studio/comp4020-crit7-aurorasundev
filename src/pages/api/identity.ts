import type { APIRoute } from "astro";
import { getUser } from "../../lib/repo";
import { IDENTITY_COOKIE, runAction, str } from "../../lib/http";

export const POST: APIRoute = (context) =>
  runAction(context, (form) => {
    const user = getUser(str(form, "user"));
    if (!user) return;
    context.cookies.set(IDENTITY_COOKIE, user.id, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });
    return { notice: `You are now ${user.name}.` };
  });
