import { createFileRoute } from "@tanstack/react-router";
import { getEveryAppUser, isAdmin } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { readClip, writeClip } from "@/server/clips";

// A lesson's clip. Private like every route: the Gateway admits members only.
// Members get published lessons' clips; admins also drafts' and may replace one.
const id = z.string().uuid();

export const Route = createFileRoute("/clips/$lessonId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = await getEveryAppUser(request, env);
        if (!user) return new Response(null, { status: 401 });
        const lessonId = id.safeParse(params.lessonId);
        const response = lessonId.success
          ? await readClip(lessonId.data, isAdmin(user), request)
          : null;
        return response ?? new Response("Not found", { status: 404 });
      },
      PUT: async ({ request, params }) => {
        const user = await getEveryAppUser(request, env);
        if (!user) return new Response(null, { status: 401 });
        if (!isAdmin(user)) {
          return Response.json(
            { error: "Only admins can upload clips" },
            { status: 403 },
          );
        }
        const lessonId = id.safeParse(params.lessonId);
        if (!lessonId.success)
          return Response.json({ error: "Not found" }, { status: 404 });
        return writeClip(lessonId.data, request);
      },
    },
  },
});
