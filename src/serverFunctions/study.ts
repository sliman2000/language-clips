import { createServerFn } from "@tanstack/react-start";
import { isAdmin } from "@every-app/sdk/server";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import { ensureLearner, setTimeZone } from "@/server/learners";
import * as lessons from "@/server/lessons";
import * as quiz from "@/server/quiz";
import * as saved from "@/server/saved";
import { isTimeZone } from "@/shared/study";

// Every function runs behind ensureUserMiddleware: `context.user` is the
// member the Gateway signed in. Admin comes from their organization role.

function requireAdmin(user: Parameters<typeof isAdmin>[0]) {
  if (!isAdmin(user)) throw new Error("Only admins can do that");
}

function found<T>(value: T | null): T {
  if (value === null) throw new Error("Not found");
  return value;
}

export const getViewer = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context: { user } }) => {
    await ensureLearner(user);
    return { email: user.email, admin: isAdmin(user) };
  });

export const getHome = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context: { user } }) =>
    quiz.getProgress(await ensureLearner(user)),
  );

export const updateTimeZone = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) =>
    z
      .object({
        timeZone: z.string().max(64).refine(isTimeZone, "Unknown time zone"),
      })
      .strict()
      .parse(data),
  )
  .handler(async ({ data, context: { user } }) => {
    await ensureLearner(user);
    await setTimeZone(user.id, data.timeZone);
    return data;
  });

export const getLibrary = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => lessons.libraryFilter.parse(data ?? {}))
  .handler(async ({ data, context: { user } }) => {
    await ensureLearner(user);
    const admin = isAdmin(user);
    const library = await lessons.listLessons(user.id, admin, data);
    return {
      ...library,
      admin,
      stats: admin ? await lessons.lessonStats() : [],
    };
  });

export const getLesson = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => lessons.lessonIdInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    await ensureLearner(user);
    const admin = isAdmin(user);
    const lesson = await lessons.getLesson(data.id, user.id, admin);
    if (!lesson) return null;
    const [stats] = admin ? await lessons.lessonStats(data.id) : [];
    return { ...lesson, admin, stats: stats ?? null };
  });

export const createLesson = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => lessons.lessonFields.parse(data))
  .handler(({ data, context: { user } }) => {
    requireAdmin(user);
    return lessons.createLesson(user.id, data);
  });

export const saveLesson = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => lessons.saveLessonInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    requireAdmin(user);
    return found(await lessons.saveLesson(data));
  });

export const publishLesson = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => lessons.publishInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    requireAdmin(user);
    return found(await lessons.setPublished(data.id, data.published));
  });

export const deleteLesson = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => lessons.lessonIdInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    requireAdmin(user);
    return found(await lessons.deleteLesson(data.id));
  });

export const getQuiz = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => lessons.lessonIdInput.parse(data))
  .handler(({ data, context: { user } }) =>
    quiz.getQuiz(data.id, isAdmin(user)),
  );

export const submitQuiz = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => quiz.submitInput.parse(data))
  .handler(async ({ data, context: { user } }) =>
    found(
      await quiz.submitQuiz(await ensureLearner(user), isAdmin(user), data),
    ),
  );

export const getSaved = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => saved.savedFilter.parse(data ?? {}))
  .handler(({ data, context: { user } }) => saved.listSaved(user.id, data));

export const saveExpression = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => saved.expressionIdInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    await ensureLearner(user);
    return found(
      await saved.saveExpression(user.id, isAdmin(user), data.expressionId),
    );
  });

export const setLearned = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => saved.learnedInput.parse(data))
  .handler(async ({ data, context: { user } }) =>
    found(await saved.setLearned(user.id, data.expressionId, data.learned)),
  );

export const removeSaved = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => saved.expressionIdInput.parse(data))
  .handler(async ({ data, context: { user } }) =>
    found(await saved.removeSaved(user.id, data.expressionId)),
  );
