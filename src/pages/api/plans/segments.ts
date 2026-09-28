import type { APIRoute } from "astro";
import { ActionError, addSegment, newPlan, removeSegment, takeSegment } from "../../../lib/actions";
import { int, runAction, str } from "../../../lib/http";
import { fmtRange, SLOT_MIN } from "../../../lib/time";

export const POST: APIRoute = (context) =>
  runAction(context, (form) => {
    const userId = context.locals.user.id;
    const intent = str(form, "intent");
    const request = {
      date: str(form, "date"),
      reqStart: int(form, "reqStart"),
      reqEnd: int(form, "reqEnd"),
      people: int(form, "people"),
    };
    if (intent === "add") {
      if (![request.reqStart, request.reqEnd, request.people].every(Number.isFinite)) {
        throw new ActionError("Search again before adding a room.");
      }
      // a bare slot button (no JavaScript) sends "roomId|start" for one half hour
      const [slotRoom, slotStart] = str(form, "slot").split("|");
      const bySlot = slotRoom && slotStart !== undefined;
      const roomId = bySlot ? slotRoom : str(form, "roomId");
      const start = bySlot ? Number(slotStart) : int(form, "start");
      const end = bySlot ? start + SLOT_MIN : int(form, "end");
      addSegment(userId, { ...request, roomId, start, end });
      return { notice: `Added ${fmtRange(start, end)} to your plan.` };
    }
    if (intent === "add-option") {
      const parts = str(form, "segments").split(",").map((part) => part.split("|"));
      for (const [roomId, start, end] of parts) {
        addSegment(userId, { ...request, roomId, start: Number(start), end: Number(end) });
      }
      return { notice: "Added the suggested option to your plan." };
    }
    if (intent === "remove") {
      removeSegment(userId, str(form, "segmentId"));
      return { notice: "Removed the segment from your plan." };
    }
    if (intent === "take") {
      takeSegment(userId, str(form, "segmentId"));
      return { notice: "You are now responsible for that segment." };
    }
    if (intent === "new") {
      newPlan(userId, request);
      return { notice: "Started a new empty plan." };
    }
    throw new ActionError("Unknown plan action.");
  });
