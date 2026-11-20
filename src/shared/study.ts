// Pure rules shared by the server and the pages: answer checking, quiz
// building and streak arithmetic.

export const LANGUAGES = ["english", "korean"] as const;
export const LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type Language = (typeof LANGUAGES)[number];
export type Level = (typeof LEVELS)[number];

export const LANGUAGE_LABELS: Record<Language, string> = {
  english: "English",
  korean: "Korean",
};
export const LEVEL_LABELS: Record<Level, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export const PASS_SCORE = 80;

/** Lowercase, no punctuation or symbols, single spaces. */
export function normalizeAnswer(value: string): string {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function answersMatch(given: string, expected: string): boolean {
  const a = normalizeAnswer(given);
  return a.length > 0 && a === normalizeAnswer(expected);
}

export interface QuizExpression {
  id: string;
  phrase: string;
  meaning: string;
  line: { text: string; start: number; end: number } | null;
}

export type QuizQuestion =
  | {
      id: string;
      kind: "listening";
      prompt: string;
      start: number;
      end: number;
    }
  | { id: string; kind: "meaning"; phrase: string; choices: string[] }
  | { id: string; kind: "speaking"; meaning: string };

const BLANK = "_____";

/**
 * The line with the phrase blanked out, and the words to type. When the
 * phrase isn't in the line, the whole line is the answer.
 */
export function blankLine(
  text: string,
  phrase: string,
): { prompt: string; answer: string } {
  const at = text.toLowerCase().indexOf(phrase.toLowerCase().trim());
  if (phrase.trim() && at >= 0) {
    return {
      prompt: text.slice(0, at) + BLANK + text.slice(at + phrase.trim().length),
      answer: text.slice(at, at + phrase.trim().length),
    };
  }
  return { prompt: BLANK, answer: text };
}

/** A small stable hash, so choices keep their order between loads. */
function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function stableShuffle<T>(items: T[], seed: string, key: (item: T) => string) {
  return [...items].sort(
    (a, b) => hash(seed + key(a)) - hash(seed + key(b)) || 0,
  );
}

/** Up to four meanings: the right one and three others from the lesson. */
export function meaningChoices(
  expression: QuizExpression,
  all: QuizExpression[],
): string[] {
  const others = [
    ...new Set(
      all
        .filter((other) => other.id !== expression.id)
        .map((other) => other.meaning)
        .filter((meaning) => meaning !== expression.meaning),
    ),
  ];
  const picked = stableShuffle(others, expression.id, (m) => m).slice(0, 3);
  return stableShuffle(
    [expression.meaning, ...picked],
    expression.id,
    (m) => m,
  );
}

export function buildQuiz(expressions: QuizExpression[]): QuizQuestion[] {
  const questions: QuizQuestion[] = [];
  for (const expression of expressions) {
    if (expression.line) {
      questions.push({
        id: `listening:${expression.id}`,
        kind: "listening",
        prompt: blankLine(expression.line.text, expression.phrase).prompt,
        start: expression.line.start,
        end: expression.line.end,
      });
    }
    questions.push({
      id: `meaning:${expression.id}`,
      kind: "meaning",
      phrase: expression.phrase,
      choices: meaningChoices(expression, expressions),
    });
    questions.push({
      id: `speaking:${expression.id}`,
      kind: "speaking",
      meaning: expression.meaning,
    });
  }
  return questions;
}

/** The expected answer for a question id, or null for an unknown id. */
export function expectedAnswer(
  questionId: string,
  expressions: QuizExpression[],
): string | null {
  const [kind, id] = questionId.split(":");
  const expression = expressions.find((e) => e.id === id);
  if (!expression) return null;
  if (kind === "meaning") return expression.meaning;
  if (kind === "speaking") return expression.phrase;
  if (kind === "listening" && expression.line) {
    return blankLine(expression.line.text, expression.phrase).answer;
  }
  return null;
}

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The calendar day (YYYY-MM-DD) of `at` in `timeZone`. */
export function dayIn(timeZone: string, at: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: isTimeZone(timeZone) ? timeZone : "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Days from `a` to `b`, both YYYY-MM-DD. */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  );
}

export interface Streak {
  current: number;
  longest: number;
  lastStudyDay: string | null;
}

/** The streak after a passed quiz on `today`. */
export function streakAfterPass(streak: Streak, today: string): Streak {
  let current: number;
  if (streak.lastStudyDay === today) current = Math.max(streak.current, 1);
  else if (streak.lastStudyDay && daysBetween(streak.lastStudyDay, today) === 1)
    current = streak.current + 1;
  else current = 1;
  return {
    current,
    longest: Math.max(streak.longest, current),
    lastStudyDay: today,
  };
}

/** The streak as shown on `today`: zero once a whole day was missed. */
export function currentStreak(streak: Streak, today: string): number {
  if (!streak.lastStudyDay) return 0;
  return daysBetween(streak.lastStudyDay, today) <= 1 ? streak.current : 0;
}
