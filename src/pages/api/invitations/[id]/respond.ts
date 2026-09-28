import type { APIRoute } from "astro";
import { ActionError, respond } from "../../../../lib/actions";
import { runAction, str } from "../../../../lib/http";

export const POST: APIRoute = (context) =>
  runAction(context, (form) => {
    const decision = str(form, "decision");
    if (decision !== "accept" && decision !== "decline") {
      throw new ActionError("Choose Accept segment or Decline.");
    }
    const accept = decision === "accept";
    respond(context.locals.user.id, context.params.id ?? "", accept);
    return {
      notice: accept
        ? "Segment accepted. The room is reserved only when the organiser confirms the plan."
        : "Invitation declined.",
    };
  });
