import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

/** One row per member, keyed by the Gateway's user id, made on first sight. */
export const learners = sqliteTable("learners", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  timeZone: text("time_zone").notNull().default("UTC"),
  stars: integer("stars").notNull().default(0),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  /** YYYY-MM-DD in the learner's time zone of the last passed quiz. */
  lastStudyDay: text("last_study_day"),
  createdAt: createdAt(),
});

/** Lessons are shared by the whole organization; admins write them. */
export const lessons = sqliteTable(
  "lessons",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    language: text("language", { enum: ["english", "korean"] }).notNull(),
    level: text("level", {
      enum: ["beginner", "intermediate", "advanced"],
    }).notNull(),
    topic: text("topic").notNull(),
    description: text("description").notNull().default(""),
    published: integer("published", { mode: "boolean" })
      .notNull()
      .default(false),
    clipKey: text("clip_key"),
    clipType: text("clip_type"),
    clipSize: integer("clip_size"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (table) => [index("lessons_published_idx").on(table.published)],
);

export const lines = sqliteTable(
  "lines",
  {
    id: text("id").primaryKey(),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    start: real("start").notNull(),
    end: real("end").notNull(),
    text: text("text").notNull(),
    translation: text("translation").notNull().default(""),
  },
  (table) => [index("lines_lesson_idx").on(table.lessonId, table.position)],
);

export const expressions = sqliteTable(
  "expressions",
  {
    id: text("id").primaryKey(),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    phrase: text("phrase").notNull(),
    meaning: text("meaning").notNull(),
    example: text("example").notNull().default(""),
    lineId: text("line_id"),
  },
  (table) => [
    index("expressions_lesson_idx").on(table.lessonId, table.position),
  ],
);

/** One quiz attempt: per-question results as JSON. */
export const attempts = sqliteTable(
  "attempts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    correct: integer("correct").notNull(),
    total: integer("total").notNull(),
    passed: integer("passed", { mode: "boolean" }).notNull(),
    results: text("results").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("attempts_user_idx").on(table.userId, table.createdAt),
    index("attempts_lesson_idx").on(table.lessonId),
  ],
);

/** A member's standing on one lesson. */
export const progress = sqliteTable(
  "progress",
  {
    userId: text("user_id").notNull(),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    bestScore: integer("best_score").notNull(),
    completedAt: text("completed_at"),
    starsEarned: integer("stars_earned").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.lessonId] })],
);

export const saved = sqliteTable(
  "saved",
  {
    userId: text("user_id").notNull(),
    expressionId: text("expression_id")
      .notNull()
      .references(() => expressions.id, { onDelete: "cascade" }),
    learned: integer("learned", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.expressionId] })],
);
