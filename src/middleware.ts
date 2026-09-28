import { defineMiddleware } from "astro:middleware";
import { IDENTITY_COOKIE } from "./lib/http";
import { getUser, listUsers } from "./lib/repo";
import { ensureDemoData } from "./lib/seed";

// No real sign-in: the header's identity switch picks one of the seeded demo
// students, so both sides of an invitation can be shown in one browser.
export const onRequest = defineMiddleware((context, next) => {
  ensureDemoData();
  const chosen = context.cookies.get(IDENTITY_COOKIE)?.value;
  const user = (chosen && getUser(chosen)) || listUsers()[0];
  if (!user) throw new Error("demo users were not seeded");
  context.locals.user = user;
  return next();
});
