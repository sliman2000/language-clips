import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { db } from "@/db";
import { lessons } from "@/db/schema";

export const MAX_CLIP_BYTES = 50 * 1024 * 1024;

const isMedia = (type: string) => /^(video|audio)\/[\w.+-]+$/i.test(type);

/** Streams a lesson's clip, honouring Range, or null when it may not be seen. */
export async function readClip(
  lessonId: string,
  admin: boolean,
  request: Request,
): Promise<Response | null> {
  const [lesson] = await db
    .select({ clipKey: lessons.clipKey, clipType: lessons.clipType })
    .from(lessons)
    .where(
      and(
        eq(lessons.id, lessonId),
        admin ? undefined : eq(lessons.published, true),
      ),
    );
  if (!lesson?.clipKey) return null;
  const head = await env.clips.head(lesson.clipKey);
  if (!head) return null;
  const size = head.size;
  const range = parseRange(request.headers.get("range"), size);
  const headers = new Headers({
    "content-type": lesson.clipType ?? "application/octet-stream",
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=3600",
    etag: head.httpEtag,
  });
  if (range === "invalid") {
    headers.set("content-range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  const object = await env.clips.get(
    lesson.clipKey,
    range
      ? { range: { offset: range.start, length: range.end - range.start + 1 } }
      : {},
  );
  if (!object) return null;
  if (range) {
    headers.set("content-range", `bytes ${range.start}-${range.end}/${size}`);
    headers.set("content-length", String(range.end - range.start + 1));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set("content-length", String(size));
  return new Response(object.body, { status: 200, headers });
}

/** One byte range ("bytes=a-b", "bytes=a-", "bytes=-n"); multiple ranges get the whole file. */
export function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | null | "invalid" {
  const match = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const [, from, to] = match;
  let start: number;
  let end: number;
  if (from === "" && to === "") return "invalid";
  if (from === "") {
    start = Math.max(0, size - Number(to));
    end = size - 1;
  } else {
    start = Number(from);
    end = to === "" ? size - 1 : Math.min(Number(to), size - 1);
  }
  if (start > end || start >= size) return "invalid";
  return { start, end };
}

/** Stores a new clip for a lesson and drops the old one. Admins only (checked by the caller). */
export async function writeClip(
  lessonId: string,
  request: Request,
): Promise<Response> {
  const type = (request.headers.get("content-type") ?? "")
    .split(";")[0]!
    .trim();
  if (!isMedia(type)) {
    return Response.json(
      { error: "Upload a video or audio file" },
      { status: 415 },
    );
  }
  const declared = Number(request.headers.get("content-length") ?? NaN);
  if (declared > MAX_CLIP_BYTES) return tooLarge();
  const [lesson] = await db
    .select({ clipKey: lessons.clipKey })
    .from(lessons)
    .where(eq(lessons.id, lessonId));
  if (!lesson) return Response.json({ error: "Not found" }, { status: 404 });
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_CLIP_BYTES) return tooLarge();
  if (body.byteLength === 0) {
    return Response.json({ error: "The file is empty" }, { status: 400 });
  }
  const key = `clips/${lessonId}/${crypto.randomUUID()}`;
  await env.clips.put(key, body, { httpMetadata: { contentType: type } });
  await db
    .update(lessons)
    .set({ clipKey: key, clipType: type, clipSize: body.byteLength })
    .where(eq(lessons.id, lessonId));
  if (lesson.clipKey) await env.clips.delete(lesson.clipKey);
  return Response.json({ size: body.byteLength, type }, { status: 201 });
}

function tooLarge() {
  return Response.json({ error: "Clips can be up to 50 MB" }, { status: 413 });
}
