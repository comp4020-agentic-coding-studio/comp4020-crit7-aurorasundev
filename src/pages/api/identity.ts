import type { APIRoute } from "astro";
import { getUser } from "../../lib/repo";
import { IDENTITY_COOKIE, runAction, safeBack, str } from "../../lib/http";

// Switching demo student works like signing in: you land on the library
// bookings home page. The one exception is an explicit "continue" (the
// invitation page's "Switch to …"), which returns to the page that asked.
export const POST: APIRoute = (context) =>
  runAction(context, (form) => {
    const user = getUser(str(form, "user"));
    if (!user) return { to: "/" };
    context.cookies.set(IDENTITY_COOKIE, user.id, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });
    const to = str(form, "continue") === "yes" ? safeBack(form.get("back"), "/") : "/";
    return { to, notice: `Signed in as ${user.name} (${user.studentNumber}).` };
  });
