import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  CornerDownRight,
  Pencil,
  Repeat,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { LessonNotFound } from "@/client/components/LessonNotFound";
import { Nav } from "@/client/components/Nav";
import { BackLink, PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Switch } from "@/client/components/ui/switch";
import { clock, errorMessage } from "@/client/lib/format";
import { getLesson, saveExpression } from "@/serverFunctions/study";
import {
  LANGUAGE_LABELS,
  LEVEL_LABELS,
  type Language,
  type Level,
} from "@/shared/study";
import { cn } from "cn";

export const Route = createFileRoute("/lessons/$lessonId/")({
  loader: ({ params }) => getLesson({ data: { id: params.lessonId } }),
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.lesson.title ?? "Lesson"} · Language Clips` },
    ],
  }),
  component: Study,
});

function Study() {
  const data = Route.useLoaderData();
  if (!data) return <LessonNotFound />;
  return <StudyLesson data={data} />;
}

type LessonData = NonNullable<Awaited<ReturnType<typeof getLesson>>>;

function StudyLesson({ data }: { data: LessonData }) {
  const { lesson, lines, expressions, progress, admin } = data;
  const media = useRef<HTMLMediaElement | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [looping, setLooping] = useState<number | null>(null);
  const [translations, setTranslations] = useState(true);
  const [saved, setSaved] = useState(() => new Set(data.savedIds));

  function onTime() {
    const el = media.current;
    if (!el) return;
    const t = el.currentTime;
    if (looping !== null) {
      const line = lines[looping]!;
      if (t >= line.end || t < line.start - 0.25) {
        el.currentTime = line.start;
        setActive(looping);
        return;
      }
    }
    const at = lines.findIndex((line) => t >= line.start && t < line.end);
    if (at >= 0) setActive(at);
  }

  function jump(index: number) {
    const el = media.current;
    setActive(index);
    if (!el) return;
    el.currentTime = lines[index]!.start;
    void el.play().catch(() => undefined);
  }

  function toggleLoop(index: number) {
    if (looping === index) {
      setLooping(null);
      return;
    }
    setLooping(index);
    jump(index);
  }

  async function save(expressionId: string) {
    try {
      await saveExpression({ data: { expressionId } });
      setSaved((prev) => new Set(prev).add(expressionId));
    } catch (cause) {
      toast.error(errorMessage(cause));
    }
  }

  const src = `/clips/${lesson.id}`;
  const isVideo = lesson.clipType?.startsWith("video/");

  return (
    <AppShell nav={<Nav />}>
      <PageHeader
        backLink={<BackLink to="/lessons">Lessons</BackLink>}
        title={lesson.title}
        description={
          <div className="space-y-2">
            {lesson.description ? <p>{lesson.description}</p> : null}
            <div className="flex flex-wrap items-center gap-1.5">
              {!lesson.published ? (
                <Badge variant="warning">Draft</Badge>
              ) : null}
              <Badge variant="outline">
                {LANGUAGE_LABELS[lesson.language as Language]}
              </Badge>
              <Badge variant="outline">
                {LEVEL_LABELS[lesson.level as Level]}
              </Badge>
              <Badge variant="secondary">{lesson.topic}</Badge>
              {progress ? (
                <span data-testid="lesson-progress">
                  {progress.completedAt ? (
                    <Badge variant="success">
                      <CheckCircle2 aria-hidden />
                      Completed · best {progress.bestScore}%
                    </Badge>
                  ) : (
                    <Badge variant="outline">Best {progress.bestScore}%</Badge>
                  )}
                </span>
              ) : null}
            </div>
          </div>
        }
        actions={
          <>
            {admin ? (
              <Button
                variant="outline"
                render={
                  <Link
                    to="/lessons/$lessonId/edit"
                    params={{ lessonId: lesson.id }}
                  />
                }
              >
                <Pencil aria-hidden />
                Edit
              </Button>
            ) : null}
            {expressions.length > 0 ? (
              <Button
                render={
                  <Link
                    to="/lessons/$lessonId/quiz"
                    params={{ lessonId: lesson.id }}
                  />
                }
              >
                Take the quiz
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0 space-y-4">
          {lesson.hasClip ? (
            isVideo ? (
              <video
                ref={(el) => {
                  media.current = el;
                }}
                data-testid="clip-player"
                src={src}
                controls
                playsInline
                preload="metadata"
                onTimeUpdate={onTime}
                className="aspect-video w-full rounded-xl border border-border bg-muted"
              />
            ) : (
              <audio
                ref={(el) => {
                  media.current = el;
                }}
                data-testid="clip-player"
                src={src}
                controls
                preload="metadata"
                onTimeUpdate={onTime}
                className="w-full"
              />
            )
          ) : (
            <EmptyState size="sm" title="No clip yet" />
          )}

          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold tracking-tight">
              Subtitles
            </h2>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch
                aria-label="Translations"
                checked={translations}
                onCheckedChange={setTranslations}
              />
              Translations
            </label>
          </div>
          {lines.length === 0 ? (
            <EmptyState size="sm" title="No subtitles yet" />
          ) : (
            <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">
              {lines.map((line, index) => (
                <li
                  key={line.id}
                  data-testid="subtitle-line"
                  data-active={active === index}
                  className={cn(
                    "flex items-start gap-2 px-3 py-2 transition-colors",
                    active === index && "bg-accent",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => jump(index)}
                    className="min-w-0 flex-1 cursor-pointer text-left"
                  >
                    <span className="mr-2 font-mono text-xs text-muted-foreground">
                      {clock(line.start)}
                    </span>
                    <span
                      className={cn(
                        active === index && "font-medium text-primary",
                      )}
                    >
                      {line.text}
                    </span>
                    {translations && line.translation ? (
                      <span className="block text-sm text-muted-foreground">
                        {line.translation}
                      </span>
                    ) : null}
                  </button>
                  <Button
                    variant={looping === index ? "default" : "ghost"}
                    size="icon-sm"
                    aria-pressed={looping === index}
                    aria-label={`Repeat line ${index + 1}`}
                    onClick={() => toggleLoop(index)}
                  >
                    <Repeat aria-hidden />
                  </Button>
                </li>
              ))}
            </ol>
          )}
        </div>

        <aside className="space-y-3">
          <h2 className="text-base font-semibold tracking-tight">
            Key expressions
          </h2>
          {expressions.length === 0 ? (
            <EmptyState size="sm" title="No expressions yet" />
          ) : (
            <ul className="space-y-3">
              {expressions.map((expression) => {
                const lineIndex = lines.findIndex(
                  (line) => line.id === expression.lineId,
                );
                const isSaved = saved.has(expression.id);
                return (
                  <li
                    key={expression.id}
                    data-testid="expression"
                    className="space-y-2 rounded-xl border border-border bg-card p-3 text-sm shadow-xs"
                  >
                    <p className="font-medium">{expression.phrase}</p>
                    <p className="text-muted-foreground">
                      {expression.meaning}
                    </p>
                    {expression.example ? (
                      <p className="border-l-2 border-border pl-2 italic">
                        {expression.example}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-1.5">
                      {lineIndex >= 0 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => jump(lineIndex)}
                        >
                          <CornerDownRight aria-hidden />
                          Go to line
                        </Button>
                      ) : null}
                      <Button
                        variant={isSaved ? "secondary" : "outline"}
                        size="sm"
                        disabled={isSaved}
                        onClick={() => void save(expression.id)}
                      >
                        {isSaved ? (
                          <BookmarkCheck aria-hidden />
                        ) : (
                          <Bookmark aria-hidden />
                        )}
                        {isSaved ? "Saved" : "Save"}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
