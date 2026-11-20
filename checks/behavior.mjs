import {
  startRuntime,
  expect,
} from "/home/user/oss-new/control/runtime/index.mjs";
import { cafeLesson, createLesson, passQuiz } from "./helpers.mjs";

const runtime = await startRuntime();
try {
  // F001: an admin authors a lesson with a clip, lines and expressions, then publishes it.
  const admin = await (await runtime.context("owner")).newPage();
  const lessonId = await createLesson(admin, cafeLesson);

  // F002 server route: the clip is served to members with range requests.
  const whole = await runtime.fetch(`/clips/${lessonId}`, { role: "member" });
  expect(whole.status).toBe(200);
  expect(whole.headers.get("content-type")).toBe("audio/wav");
  expect(whole.headers.get("accept-ranges")).toBe("bytes");
  const size = Number(whole.headers.get("content-length"));
  expect(size).toBeGreaterThan(1000);
  await whole.arrayBuffer();
  const part = await runtime.fetch(`/clips/${lessonId}`, {
    role: "member",
    headers: { range: "bytes=100-199" },
  });
  expect(part.status).toBe(206);
  expect(part.headers.get("content-range")).toBe(`bytes 100-199/${size}`);
  expect((await part.arrayBuffer()).byteLength).toBe(100);
  const tail = await runtime.fetch(`/clips/${lessonId}`, {
    role: "member",
    headers: { range: "bytes=-10" },
  });
  expect(tail.status).toBe(206);
  expect((await tail.arrayBuffer()).byteLength).toBe(10);

  // Uploads accept only video or audio.
  const wrongType = await runtime.fetch(`/clips/${lessonId}`, {
    role: "owner",
    method: "PUT",
    headers: { "content-type": "text/plain" },
    body: "hello",
  });
  expect(wrongType.status).toBe(415);

  // A second, English lesson so the filters have something to tell apart.
  const workId = await createLesson(admin, {
    title: "Asking for the bill",
    language: "Korean",
    level: "Intermediate",
    topic: "Food",
    description: "Ask for the bill at a restaurant.",
    lines: [
      {
        start: "0",
        end: "3",
        text: "계산서 주세요.",
        translation: "The bill, please.",
      },
    ],
    expressions: [
      {
        phrase: "계산서",
        meaning: "the bill",
        example: "계산서 좀 주시겠어요?",
        line: 1,
      },
    ],
  });

  // F001: members filter the library by language, level and topic.
  const memberContext = await runtime.context("member");
  const page = await memberContext.newPage();
  await page.goto("/lessons");
  await runtime.assertBackLink(page);
  const cards = page.getByTestId("lesson-card");
  await expect(cards).toHaveCount(2);
  await page.getByTestId("filter-language").click();
  await page.getByRole("option", { name: "Korean", exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Asking for the bill");
  await page.getByTestId("filter-level").click();
  await page.getByRole("option", { name: "Advanced", exact: true }).click();
  await expect(cards).toHaveCount(0);
  await expect(page.getByText("No lessons match")).toBeVisible();
  await page.goto("/lessons?topic=daily%20life");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText(cafeLesson.title);
  await page.goto("/lessons");

  // F002: study the clip with subtitles.
  await page.getByRole("link", { name: cafeLesson.title }).click();
  await expect(
    page.getByRole("heading", { name: cafeLesson.title }),
  ).toBeVisible();
  const player = page.getByTestId("clip-player");
  await expect(player).toHaveAttribute("src", `/clips/${lessonId}`);
  const lines = page.getByTestId("subtitle-line");
  await expect(lines).toHaveCount(3);
  await expect(page.getByText("¿Para tomar aquí o para llevar?")).toBeVisible();
  await page.getByRole("switch", { name: "Translations" }).click();
  await expect(page.getByText("¿Para tomar aquí o para llevar?")).toBeHidden();
  await page.getByRole("switch", { name: "Translations" }).click();
  await expect(page.getByText("¿Para tomar aquí o para llevar?")).toBeVisible();

  await lines
    .nth(1)
    .getByRole("button", { name: "Is that for here or to go?" })
    .click();
  await expect(lines.nth(1)).toHaveAttribute("data-active", "true");
  await expect
    .poll(() => player.evaluate((el) => el.currentTime))
    .toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Repeat line 2" }).click();
  await expect(
    page.getByRole("button", { name: "Repeat line 2" }),
  ).toHaveAttribute("aria-pressed", "true");
  // Playing past the line's end goes back to its start.
  await player.evaluate((el) => {
    el.currentTime = 4.5;
    el.dispatchEvent(new Event("timeupdate"));
  });
  await expect
    .poll(() => player.evaluate((el) => el.currentTime))
    .toBeLessThan(4);
  await expect(lines.nth(1)).toHaveAttribute("data-active", "true");
  await page.getByRole("button", { name: "Repeat line 2" }).click();
  await expect(
    page.getByRole("button", { name: "Repeat line 2" }),
  ).toHaveAttribute("aria-pressed", "false");

  const expressions = page.getByTestId("expression");
  await expect(expressions).toHaveCount(2);
  await expect(expressions.nth(1)).toContainText("behind schedule");
  await expect(expressions.nth(1)).toContainText(
    "Sorry, I'm running late for the meeting.",
  );
  await expressions.nth(1).getByRole("button", { name: "Go to line" }).click();
  await expect(lines.nth(2)).toHaveAttribute("data-active", "true");

  // F005: save an expression (twice is a no-op).
  await expressions.nth(0).getByRole("button", { name: "Save" }).click();
  await expect(
    expressions.nth(0).getByRole("button", { name: "Saved" }),
  ).toBeVisible();
  await expressions.nth(1).getByRole("button", { name: "Save" }).click();
  await expect(
    expressions.nth(1).getByRole("button", { name: "Saved" }),
  ).toBeVisible();

  // F003: the quiz, graded on the server.
  const result = await passQuiz(page, lessonId, cafeLesson);
  await expect(result).toContainText("100%");
  await expect(result).toContainText("Passed");
  await expect(result).toContainText("+6 stars");

  // Retake with wrong answers: best score stays, no more stars.
  await page.getByRole("button", { name: "Try again" }).click();
  await page
    .getByTestId("question")
    .filter({ hasText: "Speaking" })
    .first()
    .getByLabel("Your answer")
    .fill("could I have");
  await page.getByRole("button", { name: "Check answers" }).click();
  await expect(page.getByTestId("quiz-result")).toContainText("0%");
  await expect(page.getByTestId("quiz-result")).toContainText("Best 100%");

  // F004: streak, stars and per-level progress on the member's home.
  await page.goto("/");
  await expect(page.getByTestId("stat-streak")).toContainText("1");
  await expect(page.getByTestId("stat-longest")).toContainText("1");
  await expect(page.getByTestId("stat-stars")).toContainText("6");
  await expect(page.getByTestId("level-beginner")).toContainText("1");
  await expect(page.getByTestId("level-intermediate")).toContainText("0");
  await expect(page.getByTestId("recent-activity")).toContainText(
    cafeLesson.title,
  );
  await page.getByTestId("time-zone").click();
  await page.getByRole("option", { name: "Asia/Seoul" }).click();
  await expect(page.getByTestId("time-zone")).toContainText("Asia/Seoul");
  await page.reload();
  await expect(page.getByTestId("time-zone")).toContainText("Asia/Seoul");
  await expect(page.getByTestId("stat-streak")).toContainText("1");

  // The library marks the completed lesson.
  await page.goto("/lessons");
  await expect(cards.filter({ hasText: cafeLesson.title })).toContainText(
    "Completed",
  );
  await expect(
    cards.filter({ hasText: "Asking for the bill" }),
  ).not.toContainText("Completed");

  // F005: the saved list, its filter, review mode, learned and remove.
  await page.goto("/saved");
  const items = page.getByTestId("saved-item");
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText(cafeLesson.title);
  await page.getByTestId("saved-language").click();
  await page.getByRole("option", { name: "Korean", exact: true }).click();
  await expect(items).toHaveCount(0);
  await page.getByTestId("saved-language").click();
  await page
    .getByRole("option", { name: "All languages", exact: true })
    .click();
  await expect(items).toHaveCount(2);
  await items
    .filter({ hasText: "Can I get" })
    .getByRole("checkbox", { name: "Learned" })
    .click();
  await expect(
    items
      .filter({ hasText: "Can I get" })
      .getByRole("checkbox", { name: "Learned" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Review" }).click();
  const card = page.getByTestId("review-card");
  await expect(card).toBeVisible();
  const firstPhrase = await card.getByTestId("review-phrase").textContent();
  expect(["Can I get", "running late"]).toContain(firstPhrase);
  await expect(card.getByTestId("review-meaning")).toHaveCount(0);
  await card.getByRole("button", { name: "Show meaning" }).click();
  await expect(card.getByTestId("review-meaning")).toBeVisible();
  await card.getByRole("button", { name: "Next" }).click();
  await expect(card.getByTestId("review-phrase")).not.toHaveText(firstPhrase);
  await page.getByRole("button", { name: "Done" }).click();
  await items
    .filter({ hasText: "running late" })
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(items).toHaveCount(1);

  // F005: unpublishing hides saved items; F001: deleting removes everything made from the lesson.
  await page.goto(`/lessons/${workId}`);
  await page
    .getByTestId("expression")
    .first()
    .getByRole("button", { name: "Save" })
    .click();
  await expect(
    page
      .getByTestId("expression")
      .first()
      .getByRole("button", { name: "Saved" }),
  ).toBeVisible();
  await admin.goto(`/lessons/${workId}/edit`);
  await admin.getByRole("button", { name: "Unpublish" }).click();
  await expect(admin.getByTestId("publish-state")).toHaveText("Draft");
  await page.goto("/saved");
  await expect(items).toHaveCount(1);
  await expect(page.getByText("the bill", { exact: true })).toHaveCount(0);
  await page.goto("/lessons");
  await expect(cards).toHaveCount(1);
  await admin.getByRole("button", { name: "Delete lesson" }).click();
  await Promise.all([
    admin.waitForURL(/\/lessons$/),
    admin
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete" })
      .click(),
  ]);
  const db = await runtime.database();
  for (const table of ["lines", "expressions", "saved"]) {
    const where =
      table === "saved"
        ? "expression_id not in (select id from expressions)"
        : `lesson_id = '${workId}'`;
    const { results } = await db
      .prepare(`select count(*) as n from ${table} where ${where}`)
      .all();
    expect(results[0].n).toBe(0);
  }
  expect(
    (await runtime.fetch(`/clips/${workId}`, { role: "owner" })).status,
  ).toBe(404);

  // The journey's result for the picture: the studied lesson, completed.
  await page.goto(`/lessons/${lessonId}`);
  await expect(page.getByTestId("lesson-progress")).toContainText("Completed");
  await page
    .getByTestId("subtitle-line")
    .nth(0)
    .getByRole("button")
    .first()
    .click();
  await expect(page.getByTestId("subtitle-line").nth(0)).toHaveAttribute(
    "data-active",
    "true",
  );
  await runtime.screenshot(page);

  // Phone-sized smoke.
  const phone = await (
    await runtime.context("member", {
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    })
  ).newPage();
  await phone.goto("/lessons");
  await expect(phone.getByTestId("lesson-card")).toHaveCount(1);
  await phone.getByRole("link", { name: cafeLesson.title }).click();
  await expect(phone.getByTestId("subtitle-line")).toHaveCount(3);
  await expect(phone.getByTestId("expression")).toHaveCount(2);
  const overflow = await phone.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  console.log("behavior: ok");
} finally {
  await runtime.close();
}
