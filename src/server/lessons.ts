import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { db } from "@/db";
import {
  attempts,
  expressions,
  lessons,
  lines,
  progress,
  saved,
} from "@/db/schema";
import { LANGUAGES, LEVELS } from "@/shared/study";

export const lessonFields = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    language: z.enum(LANGUAGES),
    level: z.enum(LEVELS),
    topic: z.string().trim().min(1, "Topic is required").max(60),
    description: z.string().trim().max(500),
  })
  .strict();

const lineInput = z
  .object({
    id: z.string().uuid(),
    start: z.number().min(0).max(86_400),
    end: z.number().min(0).max(86_400),
    text: z.string().trim().min(1, "Every line needs its text").max(500),
    translation: z.string().trim().max(500),
  })
  .strict()
  .refine((line) => line.end > line.start, "A line must end after it starts");

const expressionInput = z
  .object({
    id: z.string().uuid(),
    phrase: z
      .string()
      .trim()
      .min(1, "Every expression needs a phrase")
      .max(200),
    meaning: z
      .string()
      .trim()
      .min(1, "Every expression needs a meaning")
      .max(300),
    example: z.string().trim().max(500),
    lineId: z.string().uuid().nullable(),
  })
  .strict();

export const saveLessonInput = z
  .object({
    id: z.string().uuid(),
    fields: lessonFields,
    lines: z.array(lineInput).max(300),
    expressions: z.array(expressionInput).max(100),
  })
  .strict();

export const lessonIdInput = z.object({ id: z.string().uuid() }).strict();
export const publishInput = z
  .object({ id: z.string().uuid(), published: z.boolean() })
  .strict();

export const libraryFilter = z
  .object({
    language: z.enum(LANGUAGES).optional(),
    level: z.enum(LEVELS).optional(),
    topic: z.string().trim().max(60).optional(),
  })
  .strict();

/** Members see published lessons only; admins see drafts too. */
function visible(admin: boolean) {
  return admin ? sql`1 = 1` : eq(lessons.published, true);
}

export async function listLessons(
  userId: string,
  admin: boolean,
  filter: z.infer<typeof libraryFilter>,
) {
  const rows = await db
    .select({
      id: lessons.id,
      title: lessons.title,
      language: lessons.language,
      level: lessons.level,
      topic: lessons.topic,
      description: lessons.description,
      published: lessons.published,
      completedAt: progress.completedAt,
      bestScore: progress.bestScore,
    })
    .from(lessons)
    .leftJoin(
      progress,
      and(eq(progress.lessonId, lessons.id), eq(progress.userId, userId)),
    )
    .where(
      and(
        visible(admin),
        filter.language ? eq(lessons.language, filter.language) : undefined,
        filter.level ? eq(lessons.level, filter.level) : undefined,
        filter.topic
          ? sql`lower(${lessons.topic}) = lower(${filter.topic})`
          : undefined,
      ),
    )
    .orderBy(asc(lessons.title));
  const topics = await db
    .selectDistinct({ topic: sql<string>`lower(${lessons.topic})` })
    .from(lessons)
    .where(visible(admin))
    .orderBy(sql`lower(${lessons.topic})`);
  return { lessons: rows, topics: topics.map((t) => t.topic) };
}

/** A lesson with its lines and expressions, or null when the caller may not see it. */
export async function getLesson(id: string, userId: string, admin: boolean) {
  const [lesson] = await db
    .select()
    .from(lessons)
    .where(and(eq(lessons.id, id), visible(admin)));
  if (!lesson) return null;
  const [lessonLines, lessonExpressions, mine, savedRows] = await Promise.all([
    db
      .select()
      .from(lines)
      .where(eq(lines.lessonId, id))
      .orderBy(asc(lines.position)),
    db
      .select()
      .from(expressions)
      .where(eq(expressions.lessonId, id))
      .orderBy(asc(expressions.position)),
    db
      .select()
      .from(progress)
      .where(and(eq(progress.lessonId, id), eq(progress.userId, userId))),
    db
      .select({ expressionId: saved.expressionId })
      .from(saved)
      .innerJoin(expressions, eq(expressions.id, saved.expressionId))
      .where(and(eq(saved.userId, userId), eq(expressions.lessonId, id))),
  ]);
  const { clipKey, createdBy: _createdBy, ...shown } = lesson;
  return {
    lesson: { ...shown, hasClip: clipKey !== null },
    lines: lessonLines.map(({ lessonId: _l, position: _p, ...line }) => line),
    expressions: lessonExpressions.map(
      ({ lessonId: _l, position: _p, ...expression }) => expression,
    ),
    progress: mine[0]
      ? { bestScore: mine[0].bestScore, completedAt: mine[0].completedAt }
      : null,
    savedIds: savedRows.map((row) => row.expressionId),
  };
}

export async function createLesson(
  userId: string,
  fields: z.infer<typeof lessonFields>,
) {
  const [lesson] = await db
    .insert(lessons)
    .values({ id: crypto.randomUUID(), createdBy: userId, ...fields })
    .returning({ id: lessons.id });
  return lesson!;
}

/**
 * Writes the lesson's fields, lines and expressions in one batch. Rows keep
 * their ids, so saved expressions and links survive an edit; rows left out
 * are deleted with whatever was saved from them.
 */
export async function saveLesson({
  id,
  fields,
  lines: lineList,
  expressions: expressionList,
}: z.infer<typeof saveLessonInput>) {
  const [lesson] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(eq(lessons.id, id));
  if (!lesson) return null;
  const lineIds = lineList.map((line) => line.id);
  const expressionIds = expressionList.map((e) => e.id);
  // An id that belongs to another lesson is refused rather than moved.
  const foreign = await Promise.all([
    lineIds.length
      ? db
          .select({ id: lines.id })
          .from(lines)
          .where(
            and(inArray(lines.id, lineIds), sql`${lines.lessonId} <> ${id}`),
          )
      : [],
    expressionIds.length
      ? db
          .select({ id: expressions.id })
          .from(expressions)
          .where(
            and(
              inArray(expressions.id, expressionIds),
              sql`${expressions.lessonId} <> ${id}`,
            ),
          )
      : [],
  ]);
  if (foreign[0].length || foreign[1].length) {
    throw new Error("Some rows belong to another lesson");
  }
  const lineIdSet = new Set(lineIds);
  const removedExpressions = db
    .select({ id: expressions.id })
    .from(expressions)
    .where(
      and(
        eq(expressions.lessonId, id),
        expressionIds.length
          ? notInArray(expressions.id, expressionIds)
          : undefined,
      ),
    );
  await db.batch([
    db
      .update(lessons)
      .set({ ...fields, updatedAt: new Date().toISOString() })
      .where(eq(lessons.id, id)),
    db.delete(saved).where(inArray(saved.expressionId, removedExpressions)),
    db
      .delete(expressions)
      .where(
        and(
          eq(expressions.lessonId, id),
          expressionIds.length
            ? notInArray(expressions.id, expressionIds)
            : undefined,
        ),
      ),
    db
      .delete(lines)
      .where(
        and(
          eq(lines.lessonId, id),
          lineIds.length ? notInArray(lines.id, lineIds) : undefined,
        ),
      ),
    ...lineList.map((line, position) =>
      db
        .insert(lines)
        .values({ ...line, lessonId: id, position })
        .onConflictDoUpdate({
          target: lines.id,
          set: {
            start: line.start,
            end: line.end,
            text: line.text,
            translation: line.translation,
            position,
          },
        }),
    ),
    ...expressionList.map((expression, position) => {
      const lineId =
        expression.lineId && lineIdSet.has(expression.lineId)
          ? expression.lineId
          : null;
      return db
        .insert(expressions)
        .values({ ...expression, lineId, lessonId: id, position })
        .onConflictDoUpdate({
          target: expressions.id,
          set: {
            phrase: expression.phrase,
            meaning: expression.meaning,
            example: expression.example,
            lineId,
            position,
          },
        });
    }),
  ]);
  return { id };
}

export async function setPublished(id: string, published: boolean) {
  const [lesson] = await db
    .update(lessons)
    .set({ published })
    .where(eq(lessons.id, id))
    .returning({ id: lessons.id, published: lessons.published });
  return lesson ?? null;
}

/** Deletes the lesson with everything made from it, then its clip. */
export async function deleteLesson(id: string) {
  const [lesson] = await db
    .select({ clipKey: lessons.clipKey })
    .from(lessons)
    .where(eq(lessons.id, id));
  if (!lesson) return null;
  const lessonExpressions = db
    .select({ id: expressions.id })
    .from(expressions)
    .where(eq(expressions.lessonId, id));
  await db.batch([
    db.delete(saved).where(inArray(saved.expressionId, lessonExpressions)),
    db.delete(attempts).where(eq(attempts.lessonId, id)),
    db.delete(progress).where(eq(progress.lessonId, id)),
    db.delete(expressions).where(eq(expressions.lessonId, id)),
    db.delete(lines).where(eq(lines.lessonId, id)),
    db.delete(lessons).where(eq(lessons.id, id)),
  ]);
  if (lesson.clipKey) await env.clips.delete(lesson.clipKey);
  return { id };
}

/** Per-lesson counts for admins: no one's personal history. */
export async function lessonStats(lessonId?: string) {
  return db
    .select({
      lessonId: progress.lessonId,
      completions: sql<number>`sum(case when ${progress.completedAt} is not null then 1 else 0 end)`,
      learners: sql<number>`count(*)`,
      averageScore: sql<number>`round(avg(${progress.bestScore}))`,
    })
    .from(progress)
    .where(lessonId ? eq(progress.lessonId, lessonId) : undefined)
    .groupBy(progress.lessonId);
}
