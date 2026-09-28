import type { APIRoute } from "astro";
import { invite } from "../../../../lib/actions";
import { runAction, str } from "../../../../lib/http";

export const POST: APIRoute = (context) =>
  runAction(context, (form) => {
    invite(context.locals.user.id, str(form, "segmentId"), str(form, "inviteeId"));
    return { notice: "Invitation sent. It expires in 30 minutes and does not hold the room." };
  });
