import type { APIRoute } from "astro";
import { confirmPlan } from "../../../../lib/actions";
import { runAction } from "../../../../lib/http";

export const POST: APIRoute = (context) =>
  runAction(context, (form) => {
    const planId = context.params.id ?? "";
    confirmPlan(context.locals.user.id, planId, form.get("acceptShort") === "yes");
    return { to: `/plans/${planId}`, notice: "Plan confirmed in this prototype." };
  });
