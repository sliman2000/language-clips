import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Plus } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { AppShell } from "@/client/components/AppShell";
import { ChoiceSelect } from "@/client/components/ChoiceSelect";
import { EmptyState } from "@/client/components/EmptyState";
import { Nav } from "@/client/components/Nav";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Textarea } from "@/client/components/ui/textarea";
import { errorMessage } from "@/client/lib/format";
import { createLesson, getLibrary } from "@/serverFunctions/study";
import {
  LANGUAGES,
  LANGUAGE_LABELS,
  LEVELS,
  LEVEL_LABELS,
  type Language,
  type Level,
} from "@/shared/study";
import { Alert, AlertDescription } from "@/client/components/ui/alert";

const search = z.object({
  language: z.enum(LANGUAGES).optional().catch(undefined),
  level: z.enum(LEVELS).optional().catch(undefined),
  topic: z.string().max(60).optional().catch(undefined),
});

export const Route = createFileRoute("/lessons/")({
  validateSearch: search,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getLibrary({ data: deps }),
  head: () => ({ meta: [{ title: "Lessons · Language Clips" }] }),
  component: Library,
});

const ALL = "all";
const languageChoices = [
  { value: ALL, label: "All languages" },
  ...LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_LABELS[l] })),
];
const levelChoices = [
  { value: ALL, label: "All levels" },
  ...LEVELS.map((l) => ({ value: l, label: LEVEL_LABELS[l] })),
];

function Library() {
  const { lessons, topics, admin, stats } = Route.useLoaderData();
  const filter = Route.useSearch();
  const navigate = useNavigate({ from: "/lessons/" });
  const [creating, setCreating] = useState(false);
  const filtered = Boolean(filter.language || filter.level || filter.topic);
  const statsById = new Map(stats.map((s) => [s.lessonId, s]));

  function setFilter(key: "language" | "level" | "topic", value: string) {
    void navigate({
      search: (prev) => ({ ...prev, [key]: value === ALL ? undefined : value }),
    });
  }

  return (
    <AppShell nav={<Nav />}>
      <PageHeader
        title="Lessons"
        actions={
          admin ? (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              New lesson
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap gap-2">
        <ChoiceSelect
          label="Language"
          testId="filter-language"
          value={filter.language ?? ALL}
          choices={languageChoices}
          onChange={(v) => setFilter("language", v)}
        />
        <ChoiceSelect
          label="Level"
          testId="filter-level"
          value={filter.level ?? ALL}
          choices={levelChoices}
          onChange={(v) => setFilter("level", v)}
        />
        <ChoiceSelect
          label="Topic"
          testId="filter-topic"
          value={filter.topic?.toLowerCase() ?? ALL}
          choices={[
            { value: ALL, label: "All topics" },
            ...[
              ...new Set([
                ...topics,
                ...(filter.topic ? [filter.topic.toLowerCase()] : []),
              ]),
            ].map((t) => ({ value: t, label: capitalize(t) })),
          ]}
          onChange={(v) => setFilter("topic", v)}
        />
      </div>

      {lessons.length === 0 ? (
        filtered ? (
          <EmptyState
            kind="filtered"
            title="No lessons match"
            action={
              <Button
                variant="outline"
                onClick={() => void navigate({ search: {} })}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No lessons yet"
            description={
              admin
                ? "Create one, add its clip, subtitles and expressions, then publish it."
                : "Lessons appear here once an admin publishes them."
            }
          />
        )
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {lessons.map((lesson) => {
            const stat = statsById.get(lesson.id);
            return (
              <li
                key={lesson.id}
                data-testid="lesson-card"
                className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <Link
                    to="/lessons/$lessonId"
                    params={{ lessonId: lesson.id }}
                    className="font-medium hover:underline"
                  >
                    {lesson.title}
                  </Link>
                  {lesson.completedAt ? (
                    <Badge variant="success">
                      <CheckCircle2 aria-hidden />
                      Completed
                    </Badge>
                  ) : null}
                </div>
                {lesson.description ? (
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {lesson.description}
                  </p>
                ) : null}
                <div className="mt-auto flex flex-wrap gap-1.5">
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
                </div>
                {admin && stat ? (
                  <p className="text-xs text-muted-foreground">
                    {stat.completions} completed · average best{" "}
                    {stat.averageScore}%
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {creating ? <NewLessonDialog onClose={() => setCreating(false)} /> : null}
    </AppShell>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function NewLessonDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<Language>("english");
  const [level, setLevel] = useState<Level>("beginner");
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { id } = await createLesson({
        data: { title, language, level, topic, description },
      });
      await navigate({
        to: "/lessons/$lessonId/edit",
        params: { lessonId: id },
      });
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New lesson</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-title">Title</Label>
            <Input
              id="new-title"
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="new-language">Language</Label>
              <ChoiceSelect
                id="new-language"
                label="Language"
                testId="new-language"
                className="w-full"
                value={language}
                choices={languageChoices.slice(1)}
                onChange={(v) => setLanguage(v as Language)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-level">Level</Label>
              <ChoiceSelect
                id="new-level"
                label="Level"
                testId="new-level"
                className="w-full"
                value={level}
                choices={levelChoices.slice(1)}
                onChange={(v) => setLevel(v as Level)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-topic">Topic</Label>
            <Input
              id="new-topic"
              required
              maxLength={60}
              placeholder="Travel"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-description">Description</Label>
            <Textarea
              id="new-description"
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" pending={pending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
