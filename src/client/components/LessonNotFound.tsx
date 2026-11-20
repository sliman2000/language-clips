import { Link } from "@tanstack/react-router";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { Nav } from "@/client/components/Nav";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";

/** A lesson that doesn't exist, or that this member may not open. */
export function LessonNotFound() {
  return (
    <AppShell nav={<Nav />}>
      <PageHeader title="Lessons" />
      <EmptyState
        kind="filtered"
        title="Lesson not found"
        action={
          <Button variant="outline" render={<Link to="/lessons" />}>
            All lessons
          </Button>
        }
      />
    </AppShell>
  );
}
