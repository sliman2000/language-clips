import { describe, expect, it } from "vitest";
import {
  answersMatch,
  blankLine,
  buildQuiz,
  currentStreak,
  dayIn,
  expectedAnswer,
  streakAfterPass,
} from "./study";

describe("answersMatch", () => {
  it("ignores case, punctuation and spacing", () => {
    expect(answersMatch("  Break   the ice!", "break the ice")).toBe(true);
    expect(answersMatch("잘 먹겠습니다.", "잘 먹겠습니다")).toBe(true);
    expect(answersMatch("break ice", "break the ice")).toBe(false);
    expect(answersMatch("", "")).toBe(false);
  });
});

describe("quiz", () => {
  const expressions = [
    {
      id: "a",
      phrase: "on the way",
      meaning: "coming now",
      line: { text: "I'm on the way!", start: 1, end: 3 },
    },
    { id: "b", phrase: "no worries", meaning: "it's fine", line: null },
  ];
  it("blanks the phrase in its line", () => {
    expect(blankLine("I'm on the way!", "On the way")).toEqual({
      prompt: "I'm _____!",
      answer: "on the way",
    });
  });
  it("makes listening only for linked expressions", () => {
    const kinds = buildQuiz(expressions).map((q) => q.id);
    expect(kinds).toEqual([
      "listening:a",
      "meaning:a",
      "speaking:a",
      "meaning:b",
      "speaking:b",
    ]);
    expect(expectedAnswer("speaking:b", expressions)).toBe("no worries");
    expect(expectedAnswer("listening:b", expressions)).toBeNull();
  });
});

describe("streak", () => {
  it("grows on consecutive days and resets after a gap", () => {
    let s = { current: 0, longest: 0, lastStudyDay: null as string | null };
    s = streakAfterPass(s, "2026-01-01");
    s = streakAfterPass(s, "2026-01-01");
    s = streakAfterPass(s, "2026-01-02");
    expect(s).toEqual({ current: 2, longest: 2, lastStudyDay: "2026-01-02" });
    expect(currentStreak(s, "2026-01-03")).toBe(2);
    expect(currentStreak(s, "2026-01-04")).toBe(0);
    s = streakAfterPass(s, "2026-01-05");
    expect(s).toEqual({ current: 1, longest: 2, lastStudyDay: "2026-01-05" });
  });
  it("uses the time zone's calendar day", () => {
    const at = new Date("2026-01-01T20:00:00Z");
    expect(dayIn("UTC", at)).toBe("2026-01-01");
    expect(dayIn("Asia/Seoul", at)).toBe("2026-01-02");
  });
});
