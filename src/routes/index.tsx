import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { Flame, Star, Trophy } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { ChoiceSelect } from "@/client/components/ChoiceSelect";
import { EmptyState } from "@/client/components/EmptyState";
import { Nav } from "@/client/components/Nav";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { Label } from "@/client/components/ui/label";
import { errorMessage } from "@/client/lib/format";
import { getHome, updateTimeZone } from "@/serverFunctions/study";
import { LEVELS, LEVEL_LABELS } from "@/shared/study";

export const Route = createFileRoute("/")({
  loader: () => getHome(),
  head: () => ({ meta: [{ title: "Language Clips" }] }),
  component: Home,
});

function zones(current: string): string[] {
  const all =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [];
  return [...new Set(["UTC", current, ...all])];
}

function Home() {
  const home = Route.useLoaderData();
  const router = useRouter();
  const timeZones = useMemo(
    () => zones(home.timeZone).map((zone) => ({ value: zone, label: zone })),
    [home.timeZone],
  );

  async function changeZone(timeZone: string) {
    try {
      await updateTimeZone({ data: { timeZone } });
      await router.invalidate();
    } catch (cause) {
      toast.error(errorMessage(cause));
    }
  }

  return (
    <AppShell nav={<Nav />}>
      <PageHeader
        title="Your progress"
        actions={
          <Button render={<Link to="/lessons" />}>Browse lessons</Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          testId="stat-streak"
          icon={<Flame aria-hidden />}
          label="Current streak"
          value={days(home.currentStreak)}
        />
        <Stat
          testId="stat-longest"
          icon={<Trophy aria-hidden />}
          label="Longest streak"
          value={days(home.longestStreak)}
        />
        <Stat
          testId="stat-stars"
          icon={<Star aria-hidden />}
          label="Stars"
          value={String(home.stars)}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight">
          Lessons completed
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {LEVELS.map((level) => (
            <Card key={level} size="sm" data-testid={`level-${level}`}>
              <CardContent className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {LEVEL_LABELS[level]}
                </span>
                <span className="text-lg font-semibold">
                  {home.perLevel[level] ?? 0}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight">
          Recent activity
        </h2>
        <div data-testid="recent-activity">
          {home.recent.length === 0 ? (
            <EmptyState
              title="No quizzes yet"
              description="Pass a lesson's quiz to start your streak."
            />
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">
              {home.recent.map((attempt) => (
                <li
                  key={attempt.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <Link
                    to="/lessons/$lessonId"
                    params={{ lessonId: attempt.lessonId }}
                    className="min-w-0 truncate font-medium hover:underline"
                  >
                    {attempt.title}
                  </Link>
                  <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                    <Badge variant={attempt.passed ? "success" : "outline"}>
                      {attempt.score}%
                    </Badge>
                    <time dateTime={attempt.createdAt}>
                      {new Date(attempt.createdAt).toLocaleDateString(
                        undefined,
                        {
                          timeZone: home.timeZone,
                          month: "short",
                          day: "numeric",
                        },
                      )}
                    </time>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-3">
        <Label htmlFor="time-zone">Time zone</Label>
        <ChoiceSelect
          id="time-zone"
          label="Time zone"
          testId="time-zone"
          value={home.timeZone}
          choices={timeZones}
          onChange={(zone) => void changeZone(zone)}
        />
      </section>
    </AppShell>
  );
}

function days(count: number) {
  return count === 1 ? "1 day" : `${count} days`;
}

function Stat({
  testId,
  icon,
  label,
  value,
}: {
  testId: string;
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="space-y-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground [&_svg]:size-4">
          {icon}
          {label}
        </div>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
