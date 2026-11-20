import {
  startRuntime,
  expect,
} from "/home/user/oss-new/control/runtime/index.mjs";
import { cafeLesson, createLesson, passQuiz, toneWav } from "./helpers.mjs";

const runtime = await startRuntime();
try {
  // X001: every page and route needs a member of this organization.
  await runtime.assertPrivateAccess(["/", "/lessons", "/saved", "/health"]);

  // X001: no sign-in of the app's own.
  for (const path of ["/login", "/signin", "/sign-in", "/signup", "/logout"]) {
    expect([401, 403]).toContain((await runtime.fetch(path)).status);
    const page = await runtime.fetch(path, { role: "member" });
    expect(page.status).toBe(404);
    expect(await page.text()).not.toMatch(/type="password"/);
  }

  const admin = await (await runtime.context("owner")).newPage();
  const publishedId = await createLesson(admin, cafeLesson);
  const draftId = await createLesson(
    admin,
    {
      ...cafeLesson,
      title: "Asking for directions",
      topic: "Travel",
      lines: cafeLesson.lines.slice(0, 1),
      expressions: cafeLesson.expressions.slice(0, 1),
    },
    { publish: false },
  );

  // Capture how the page asks to publish, to replay it as a member.
  await admin.goto(`/lessons/${publishedId}/edit`);
  const [publishCall] = await Promise.all([
    admin.waitForRequest(
      (r) =>
        r.method() === "POST" && (r.postData() ?? "").includes(publishedId),
    ),
    admin.getByRole("button", { name: "Unpublish" }).click(),
  ]);
  await expect(admin.getByTestId("publish-state")).toHaveText("Draft");
  await admin.getByRole("button", { name: "Publish" }).click();
  await expect(admin.getByTestId("publish-state")).toHaveText("Published");

  // Anonymous and outsiders get no clip bytes.
  for (const role of [undefined, "outsider"]) {
    expect([401, 403]).toContain(
      (await runtime.fetch(`/clips/${publishedId}`, { role })).status,
    );
  }
  expect([401, 403]).toContain(
    (
      await runtime.fetch(`/clips/${publishedId}`, {
        method: "PUT",
        headers: { "content-type": "audio/wav" },
        body: toneWav(1),
      })
    ).status,
  );

  // Drafts are the admins' only.
  const memberContext = await runtime.context("member");
  const member = await memberContext.newPage();
  await member.goto("/lessons");
  await expect(member.getByTestId("lesson-card")).toHaveCount(1);
  await expect(member.getByText("Asking for directions")).toHaveCount(0);
  await expect(member.getByRole("button", { name: "New lesson" })).toHaveCount(
    0,
  );
  for (const path of [
    `/lessons/${draftId}`,
    `/lessons/${draftId}/quiz`,
    `/lessons/${draftId}/edit`,
    `/lessons/${publishedId}/edit`,
  ]) {
    await member.goto(path);
    await expect(member.getByText("Lesson not found")).toBeVisible();
    await expect(
      member.getByRole("button", { name: "Save lesson" }),
    ).toHaveCount(0);
  }
  expect(
    (await runtime.fetch(`/clips/${draftId}`, { role: "member" })).status,
  ).toBe(404);
  expect(
    (await runtime.fetch(`/clips/${draftId}`, { role: "owner" })).status,
  ).toBe(200);

  // Admin-only actions refuse members, even when called directly.
  const db = await runtime.database();
  const clipBefore = (
    await db
      .prepare("select clip_key from lessons where id = ?")
      .bind(publishedId)
      .first()
  ).clip_key;
  const upload = await runtime.fetch(`/clips/${publishedId}`, {
    role: "member",
    method: "PUT",
    headers: { "content-type": "audio/wav" },
    body: toneWav(1),
  });
  expect(upload.status).toBe(403);
  expect(
    (
      await db
        .prepare("select clip_key from lessons where id = ?")
        .bind(publishedId)
        .first()
    ).clip_key,
  ).toBe(clipBefore);

  const headers = await publishCall.allHeaders();
  for (const name of ["cookie", "host", "content-length", "origin", "referer"])
    delete headers[name];
  const replay = await runtime.fetch(new URL(publishCall.url()).pathname, {
    role: "member",
    method: "POST",
    headers,
    body: publishCall.postData().replaceAll(publishedId, draftId),
  });
  expect(await replay.text()).toContain("Only admins can do that");
  expect(
    (
      await db
        .prepare("select published from lessons where id = ?")
        .bind(draftId)
        .first()
    ).published,
  ).toBe(0);

  // One member's saved list and progress are theirs alone.
  await member.goto(`/lessons/${publishedId}`);
  const [saveCall] = await Promise.all([
    member.waitForRequest(
      (r) =>
        r.method() === "POST" && (r.postData() ?? "").includes("expressionId"),
    ),
    member
      .getByTestId("expression")
      .first()
      .getByRole("button", { name: "Save" })
      .click(),
  ]);
  await expect(
    member
      .getByTestId("expression")
      .first()
      .getByRole("button", { name: "Saved" }),
  ).toBeVisible();
  const result = await passQuiz(member, publishedId, cafeLesson);
  await expect(result).toContainText("Passed");

  await admin.goto("/saved");
  await expect(admin.getByTestId("saved-item")).toHaveCount(0);
  await admin.goto("/");
  await expect(admin.getByTestId("stat-stars")).toContainText("0");
  await expect(admin.getByTestId("recent-activity")).not.toContainText(
    cafeLesson.title,
  );
  // Admins see counts per lesson, never who.
  await admin.goto(`/lessons/${publishedId}/edit`);
  await expect(admin.getByTestId("lesson-stats")).toContainText("1 completed");
  await expect(admin.locator("body")).not.toContainText("member@example.test");

  // The owner replaying the member's save call only touches the owner's own list.
  const savedRow = "select count(*) as n from saved where user_id = ?";
  expect((await db.prepare(savedRow).bind("member").first()).n).toBe(1);
  const ownerHeaders = await saveCall.allHeaders();
  for (const name of ["cookie", "host", "content-length", "origin", "referer"])
    delete ownerHeaders[name];
  const ownerSave = await runtime.fetch(new URL(saveCall.url()).pathname, {
    role: "owner",
    method: "POST",
    headers: ownerHeaders,
    body: saveCall.postData(),
  });
  expect(ownerSave.status).toBe(200);
  expect((await db.prepare(savedRow).bind("owner").first()).n).toBe(1);
  await admin.goto("/saved");
  await admin
    .getByTestId("saved-item")
    .first()
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(admin.getByTestId("saved-item")).toHaveCount(0);
  expect((await db.prepare(savedRow).bind("member").first()).n).toBe(1);
  await member.goto("/saved");
  await expect(member.getByTestId("saved-item")).toHaveCount(1);

  // A second member, signed straight onto the Worker, sees none of the first one's data.
  const other = await runtime.token({
    subject: {
      sub: "member-2",
      email: "second@example.test",
      orgRole: "member",
    },
  });
  const draftClip = await runtime.mf.dispatchFetch(
    `http://${runtime.hostname}/clips/${draftId}`,
    { headers: { "x-everyapp-identity": other } },
  );
  expect(draftClip.status).toBe(404);
  const saved = await runtime.mf.dispatchFetch(
    `http://${runtime.hostname}/saved`,
    { headers: { "x-everyapp-identity": other } },
  );
  expect(saved.status).toBe(200);
  expect(await saved.text()).not.toContain("Can I get");
  console.log("authorization: ok");
} finally {
  await runtime.close();
}
