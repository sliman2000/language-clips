import {
  startRuntime,
  expect,
} from "/home/user/oss-new/control/runtime/index.mjs";
import { cafeLesson, createLesson, passQuiz } from "./helpers.mjs";

const runtime = await startRuntime();
try {
  const admin = await (await runtime.context("owner")).newPage();
  const lessonId = await createLesson(admin, cafeLesson);
  const member = await (await runtime.context("member")).newPage();
  await member.goto(`/lessons/${lessonId}`);
  await member
    .getByTestId("expression")
    .first()
    .getByRole("button", { name: "Save" })
    .click();
  await expect(
    member
      .getByTestId("expression")
      .first()
      .getByRole("button", { name: "Saved" }),
  ).toBeVisible();
  await expect(await passQuiz(member, lessonId, cafeLesson)).toContainText(
    "Passed",
  );
  const size = Number(
    (await runtime.fetch(`/clips/${lessonId}`, { role: "member" })).headers.get(
      "content-length",
    ),
  );

  await runtime.restart();

  const after = await (await runtime.context("member")).newPage();
  await after.goto("/lessons");
  await expect(
    after.getByTestId("lesson-card").filter({ hasText: cafeLesson.title }),
  ).toContainText("Completed");
  await after.goto(`/lessons/${lessonId}`);
  await expect(after.getByTestId("subtitle-line")).toHaveCount(3);
  await expect(after.getByTestId("expression")).toHaveCount(2);
  await after.goto("/saved");
  await expect(after.getByTestId("saved-item")).toHaveCount(1);
  await after.goto("/");
  await expect(after.getByTestId("stat-stars")).toContainText("6");
  await expect(after.getByTestId("stat-streak")).toContainText("1");
  const clip = await runtime.fetch(`/clips/${lessonId}`, {
    role: "member",
    headers: { range: "bytes=0-43" },
  });
  expect(clip.status).toBe(206);
  expect(clip.headers.get("content-range")).toBe(`bytes 0-43/${size}`);
  expect(
    Buffer.from(await clip.arrayBuffer())
      .subarray(0, 4)
      .toString(),
  ).toBe("RIFF");
  console.log("persistence: ok");
} finally {
  await runtime.close();
}
