import type { APIRoute } from "astro";
import { respond } from "../../../../lib/actions";
import { runAction, str } from "../../../../lib/http";

export const POST: APIRoute = (context) =>
  runAction(context, (form) => {
    const accept = str(form, "decision") === "accept";
    respond(context.locals.user.id, context.params.id ?? "", accept);
    return {
      notice: accept
        ? "Segment accepted. The room is reserved only when the organiser confirms the plan."
        : "Invitation declined.",
    };
  });
