import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { expressions, lessons, saved } from "@/db/schema";
import { LANGUAGES } from "@/shared/study";

export const expressionIdInput = z
  .object({ expressionId: z.string().uuid() })
  .strict();
export const learnedInput = z
  .object({ expressionId: z.string().uuid(), learned: z.boolean() })
  .strict();
export const savedFilter = z
  .object({ language: z.enum(LANGUAGES).optional() })
  .strict();

/** Saves an expression the member can see; saving it again changes nothing. */
export async function saveExpression(
  userId: string,
  admin: boolean,
  expressionId: string,
) {
  const [expression] = await db
    .select({ id: expressions.id })
    .from(expressions)
    .innerJoin(lessons, eq(lessons.id, expressions.lessonId))
    .where(
      and(
        eq(expressions.id, expressionId),
        admin ? undefined : eq(lessons.published, true),
      ),
    );
  if (!expression) return null;
  await db.insert(saved).values({ userId, expressionId }).onConflictDoNothing();
  return { expressionId };
}

/** The member's list; items from unpublished or deleted lessons drop out. */
export function listSaved(userId: string, filter: z.infer<typeof savedFilter>) {
  return db
    .select({
      expressionId: saved.expressionId,
      learned: saved.learned,
      phrase: expressions.phrase,
      meaning: expressions.meaning,
      example: expressions.example,
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      language: lessons.language,
    })
    .from(saved)
    .innerJoin(expressions, eq(expressions.id, saved.expressionId))
    .innerJoin(lessons, eq(lessons.id, expressions.lessonId))
    .where(
      and(
        eq(saved.userId, userId),
        eq(lessons.published, true),
        filter.language ? eq(lessons.language, filter.language) : undefined,
      ),
    )
    .orderBy(desc(saved.createdAt), saved.expressionId);
}

export async function setLearned(
  userId: string,
  expressionId: string,
  learned: boolean,
) {
  const [row] = await db
    .update(saved)
    .set({ learned })
    .where(and(eq(saved.userId, userId), eq(saved.expressionId, expressionId)))
    .returning({ expressionId: saved.expressionId });
  return row ?? null;
}

export async function removeSaved(userId: string, expressionId: string) {
  const [row] = await db
    .delete(saved)
    .where(and(eq(saved.userId, userId), eq(saved.expressionId, expressionId)))
    .returning({ expressionId: saved.expressionId });
  return row ?? null;
}
