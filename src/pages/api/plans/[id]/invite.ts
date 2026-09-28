import type { APIRoute } from "astro";
import { invite } from "../../../../lib/actions";
import { runAction, str } from "../../../../lib/http";

export const POST: APIRoute = (context) =>
  runAction(context, (form) => {
    const created = invite(
      context.locals.user.id,
      str(form, "segmentId"),
      str(form, "studentNumber"),
      str(form, "confirmed") === "yes",
    );
    return {
      to: `/plans/${context.params.id}`,
      notice: `Invitation sent to ${created.inviteeName} (${created.studentNumber}). It expires in 30 minutes and does not hold the room.`,
    };
  });
