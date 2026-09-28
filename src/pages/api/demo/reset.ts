import type { APIRoute } from "astro";
import { notify } from "../../../lib/actions";
import { listUsers } from "../../../lib/repo";
import { runAction } from "../../../lib/http";
import { resetDemoData } from "../../../lib/seed";

export const POST: APIRoute = (context) =>
  runAction(context, () => {
    resetDemoData();
    notify(listUsers().map((u) => u.id));
    return { to: "/search", notice: "Demo data reset. All prototype plans and invitations were cleared." };
  });
