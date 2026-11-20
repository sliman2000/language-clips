import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  attempts,
  expressions,
  learners,
  lessons,
  lines,
  progress,
} from "@/db/schema";
import {
  PASS_SCORE,
  answersMatch,
  buildQuiz,
  currentStreak,
  dayIn,
  expectedAnswer,
  streakAfterPass,
  type QuizExpression,
} from "@/shared/study";
import type { Learner } from "@/server/learners";

export const submitInput = z
  .object({
    lessonId: z.string().uuid(),
    answers: z
      .array(
        z
          .object({
            questionId: z.string().max(80),
            answer: z.string().max(500),
          })
          .strict(),
      )
      .max(400),
  })
  .strict();

async function quizExpressions(
  lessonId: string,
  admin: boolean,
): Promise<{
  title: string;
  language: string;
  expressions: QuizExpression[];
} | null> {
  const [lesson] = await db
    .select({ title: lessons.title, language: lessons.language })
    .from(lessons)
    .where(
      and(
        eq(lessons.id, lessonId),
        admin ? undefined : eq(lessons.published, true),
      ),
    );
  if (!lesson) return null;
  const rows = await db
    .select({
      id: expressions.id,
      phrase: expressions.phrase,
      meaning: expressions.meaning,
      text: lines.text,
      start: lines.start,
      end: lines.end,
    })
    .from(expressions)
    .leftJoin(lines, eq(lines.id, expressions.lineId))
    .where(eq(expressions.lessonId, lessonId))
    .orderBy(asc(expressions.position));
  return {
    ...lesson,
    expressions: rows.map((row) => ({
      id: row.id,
      phrase: row.phrase,
      meaning: row.meaning,
      line:
        row.text !== null && row.start !== null && row.end !== null
          ? { text: row.text, start: row.start, end: row.end }
          : null,
    })),
  };
}

/** The questions only: never the answers. */
export async function getQuiz(lessonId: string, admin: boolean) {
  const quiz = await quizExpressions(lessonId, admin);
  if (!quiz) return null;
  return {
    title: quiz.title,
    language: quiz.language,
    questions: buildQuiz(quiz.expressions),
  };
}

/**
 * Grades on the server, records the attempt, and on a pass updates the
 * learner's best score, completion, stars (first completion only) and streak.
 */
export async function submitQuiz(
  learner: Learner,
  admin: boolean,
  input: z.infer<typeof submitInput>,
  now = new Date(),
) {
  const quiz = await quizExpressions(input.lessonId, admin);
  if (!quiz) return null;
  const questions = buildQuiz(quiz.expressions);
  if (questions.length === 0) throw new Error("This lesson has no quiz yet");
  const given = new Map(input.answers.map((a) => [a.questionId, a.answer]));
  const results = questions.map((question) => ({
    questionId: question.id,
    correct: answersMatch(
      given.get(question.id) ?? "",
      expectedAnswer(question.id, quiz.expressions) ?? "",
    ),
    expected: expectedAnswer(question.id, quiz.expressions) ?? "",
  }));
  const correct = results.filter((r) => r.correct).length;
  const total = results.length;
  const score = Math.round((correct / total) * 100);
  const passed = score >= PASS_SCORE;

  const [before] = await db
    .select()
    .from(progress)
    .where(
      and(
        eq(progress.userId, learner.id),
        eq(progress.lessonId, input.lessonId),
      ),
    );
  await db.batch([
    db.insert(attempts).values({
      id: crypto.randomUUID(),
      userId: learner.id,
      lessonId: input.lessonId,
      score,
      correct,
      total,
      passed,
      results: JSON.stringify(
        results.map(({ questionId, correct }) => ({ questionId, correct })),
      ),
      createdAt: now.toISOString(),
    }),
    db
      .insert(progress)
      .values({
        userId: learner.id,
        lessonId: input.lessonId,
        bestScore: score,
      })
      .onConflictDoUpdate({
        target: [progress.userId, progress.lessonId],
        set: { bestScore: sql`max(${progress.bestScore}, ${score})` },
      }),
  ]);

  let starsEarned = 0;
  if (passed) {
    // Only the first completion earns stars: the update matches once.
    const [first] = await db
      .update(progress)
      .set({ completedAt: now.toISOString(), starsEarned: correct })
      .where(
        and(
          eq(progress.userId, learner.id),
          eq(progress.lessonId, input.lessonId),
          isNull(progress.completedAt),
        ),
      )
      .returning({ userId: progress.userId });
    if (first) starsEarned = correct;
    const [fresh] = await db
      .select()
      .from(learners)
      .where(eq(learners.id, learner.id));
    const streak = streakAfterPass(
      {
        current: fresh!.currentStreak,
        longest: fresh!.longestStreak,
        lastStudyDay: fresh!.lastStudyDay,
      },
      dayIn(fresh!.timeZone, now),
    );
    await db
      .update(learners)
      .set({
        stars: sql`${learners.stars} + ${starsEarned}`,
        currentStreak: streak.current,
        longestStreak: streak.longest,
        lastStudyDay: streak.lastStudyDay,
      })
      .where(eq(learners.id, learner.id));
  }
  return {
    score,
    correct,
    total,
    passed,
    starsEarned,
    bestScore: Math.max(before?.bestScore ?? 0, score),
    results,
  };
}

/** The member's own progress page. */
export async function getProgress(learner: Learner, now = new Date()) {
  const [perLevel, recent] = await Promise.all([
    db
      .select({
        level: lessons.level,
        completed: sql<number>`count(*)`,
      })
      .from(progress)
      .innerJoin(lessons, eq(lessons.id, progress.lessonId))
      .where(
        and(
          eq(progress.userId, learner.id),
          sql`${progress.completedAt} is not null`,
        ),
      )
      .groupBy(lessons.level),
    db
      .select({
        id: attempts.id,
        lessonId: attempts.lessonId,
        title: lessons.title,
        score: attempts.score,
        passed: attempts.passed,
        createdAt: attempts.createdAt,
      })
      .from(attempts)
      .innerJoin(lessons, eq(lessons.id, attempts.lessonId))
      .where(eq(attempts.userId, learner.id))
      .orderBy(desc(attempts.createdAt))
      .limit(10),
  ]);
  return {
    timeZone: learner.timeZone,
    stars: learner.stars,
    currentStreak: currentStreak(
      {
        current: learner.currentStreak,
        longest: learner.longestStreak,
        lastStudyDay: learner.lastStudyDay,
      },
      dayIn(learner.timeZone, now),
    ),
    longestStreak: learner.longestStreak,
    perLevel: Object.fromEntries(perLevel.map((r) => [r.level, r.completed])),
    recent,
  };
}
