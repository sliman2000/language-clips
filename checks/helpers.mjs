// Shared steps for the suites: they drive the app the way a person does.
import { expect } from "/home/user/oss-new/control/runtime/index.mjs";

/** A short mono WAV tone, so the clip is real, playable audio. */
export function toneWav(seconds = 6) {
  const rate = 8000;
  const samples = rate * seconds;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    buffer.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 3000),
      44 + i * 2,
    );
  }
  return buffer;
}

export const cafeLesson = {
  title: "Ordering coffee to go",
  language: "English",
  level: "Beginner",
  topic: "Daily life",
  description: "Order a drink politely and say you're in a hurry.",
  lines: [
    {
      start: "0",
      end: "2",
      text: "Can I get a large latte, please?",
      translation: "¿Me da un café con leche grande, por favor?",
    },
    {
      start: "2",
      end: "4",
      text: "Is that for here or to go?",
      translation: "¿Para tomar aquí o para llevar?",
    },
    {
      start: "4",
      end: "6",
      text: "To go, please. I'm running late.",
      translation: "Para llevar, por favor. Voy tarde.",
    },
  ],
  expressions: [
    {
      phrase: "Can I get",
      meaning: "a polite way to order",
      example: "Can I get the check, please?",
      line: 1,
    },
    {
      phrase: "running late",
      meaning: "behind schedule",
      example: "Sorry, I'm running late for the meeting.",
      line: 3,
    },
  ],
  // What a member types in the quiz.
  answers: {
    listening: ["can I get", "running late"],
    speaking: ["Can I get!", "Running  late"],
  },
};

async function pick(page, testId, option) {
  await page.getByTestId(testId).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** As an admin: create, fill, upload a clip, save, optionally publish. Returns the lesson id. */
export async function createLesson(page, lesson, { publish = true } = {}) {
  await page.goto("/lessons");
  await page.getByRole("button", { name: "New lesson" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill(lesson.title);
  await pick(page, "new-language", lesson.language);
  await pick(page, "new-level", lesson.level);
  await dialog.getByLabel("Topic").fill(lesson.topic);
  await dialog.getByLabel("Description").fill(lesson.description);
  await Promise.all([
    page.waitForURL(/\/lessons\/[0-9a-f-]{36}\/edit$/),
    dialog.getByRole("button", { name: "Create" }).click(),
  ]);
  const id = page.url().match(/lessons\/([0-9a-f-]{36})\/edit/)[1];

  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes(`/clips/${id}`) && r.request().method() === "PUT",
    ),
    page
      .getByTestId("clip-input")
      .setInputFiles({
        name: "clip.wav",
        mimeType: "audio/wav",
        buffer: toneWav(),
      }),
  ]);
  await expect(page.getByTestId("clip-status")).toContainText("audio/wav");

  for (const [i, line] of lesson.lines.entries()) {
    await page.getByRole("button", { name: "Add line" }).click();
    const n = i + 1;
    await page.getByLabel(`Line ${n} start`).fill(line.start);
    await page.getByLabel(`Line ${n} end`).fill(line.end);
    await page.getByLabel(`Line ${n} text`).fill(line.text);
    await page.getByLabel(`Line ${n} translation`).fill(line.translation);
  }
  for (const [i, expression] of lesson.expressions.entries()) {
    await page.getByRole("button", { name: "Add expression" }).click();
    const n = i + 1;
    await page.getByLabel(`Expression ${n} phrase`).fill(expression.phrase);
    await page.getByLabel(`Expression ${n} meaning`).fill(expression.meaning);
    await page.getByLabel(`Expression ${n} example`).fill(expression.example);
    if (expression.line) {
      await page.getByTestId(`expression-${n}-line`).click();
      await page
        .getByRole("option", { name: new RegExp(`^${expression.line}\\.`) })
        .click();
    }
  }
  await page.getByRole("button", { name: "Save lesson" }).click();
  await expect(page.getByText("Lesson saved")).toBeVisible();
  if (publish) {
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByTestId("publish-state")).toHaveText("Published");
  }
  return id;
}

/** As a member: answer every question with the lesson's right answers, submit, return the result locator. */
export async function passQuiz(page, id, lesson) {
  await page.goto(`/lessons/${id}/quiz`);
  const listening = page
    .getByTestId("question")
    .filter({ hasText: "Listening" });
  const meaning = page.getByTestId("question").filter({ hasText: "Meaning" });
  const speaking = page.getByTestId("question").filter({ hasText: "Speaking" });
  await expect(listening).toHaveCount(lesson.answers.listening.length);
  for (const [i, answer] of lesson.answers.listening.entries()) {
    await listening.nth(i).getByLabel("Missing words").fill(answer);
  }
  for (const [i, expression] of lesson.expressions.entries()) {
    await meaning
      .nth(i)
      .getByRole("radio", { name: expression.meaning, exact: true })
      .click();
  }
  for (const [i, answer] of lesson.answers.speaking.entries()) {
    await speaking.nth(i).getByLabel("Your answer").fill(answer);
  }
  await page.getByRole("button", { name: "Check answers" }).click();
  const result = page.getByTestId("quiz-result");
  await expect(result).toBeVisible();
  return result;
}
