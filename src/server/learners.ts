import { eq } from "drizzle-orm";
import { db } from "@/db";
import { learners } from "@/db/schema";

export type Learner = typeof learners.$inferSelect;

/** The member's own row, made the first time they're seen. */
export async function ensureLearner(user: {
  id: string;
  email: string;
}): Promise<Learner> {
  const [row] = await db
    .insert(learners)
    .values({ id: user.id, email: user.email })
    .onConflictDoUpdate({ target: learners.id, set: { email: user.email } })
    .returning();
  return row!;
}

export async function setTimeZone(userId: string, timeZone: string) {
  await db.update(learners).set({ timeZone }).where(eq(learners.id, userId));
}
