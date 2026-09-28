import type { APIRoute } from "astro";
import { ActionError, cancelPlan, cancelSegment } from "../../../../lib/actions";
import { runAction, str } from "../../../../lib/http";

export const POST: APIRoute = (context) =>
  runAction(context, (form) => {
    if (str(form, "confirmed") !== "yes") throw new ActionError("Confirm the cancellation before continuing.");
    const userId = context.locals.user.id;
    const planId = context.params.id ?? "";
    if (str(form, "scope") === "plan") {
      cancelPlan(userId, planId);
      return { to: `/plans/${planId}`, notice: "Plan cancelled in this prototype. The rooms are free again." };
    }
    cancelSegment(userId, str(form, "segmentId"));
    return { to: `/plans/${planId}`, notice: "Booking cancelled in this prototype. The room is free again." };
  });
