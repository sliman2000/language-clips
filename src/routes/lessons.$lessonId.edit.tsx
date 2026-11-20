import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { Plus, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { ChoiceSelect } from "@/client/components/ChoiceSelect";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { LessonNotFound } from "@/client/components/LessonNotFound";
import { Nav } from "@/client/components/Nav";
import { BackLink, PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Textarea } from "@/client/components/ui/textarea";
import { errorMessage } from "@/client/lib/format";
import {
  deleteLesson,
  getLesson,
  publishLesson,
  saveLesson,
} from "@/serverFunctions/study";
import {
  LANGUAGES,
  LANGUAGE_LABELS,
  LEVELS,
  LEVEL_LABELS,
  type Language,
  type Level,
} from "@/shared/study";

export const Route = createFileRoute("/lessons/$lessonId/edit")({
  loader: ({ params }) => getLesson({ data: { id: params.lessonId } }),
  head: () => ({ meta: [{ title: "Edit lesson · Language Clips" }] }),
  component: EditPage,
});

const MAX_CLIP_BYTES = 50 * 1024 * 1024;
const NO_LINE = "none";

type LessonData = NonNullable<Awaited<ReturnType<typeof getLesson>>>;

function EditPage() {
  const data = Route.useLoaderData();
  if (!data?.admin) return <LessonNotFound />;
  return <Editor key={data.lesson.id} data={data} />;
}

interface LineDraft {
  id: string;
  start: string;
  end: string;
  text: string;
  translation: string;
}
interface ExpressionDraft {
  id: string;
  phrase: string;
  meaning: string;
  example: string;
  lineId: string;
}

function Editor({ data }: { data: LessonData }) {
  const { lesson, stats } = data;
  const router = useRouter();
  const navigate = useNavigate();
  const [title, setTitle] = useState(lesson.title);
  const [language, setLanguage] = useState(lesson.language as Language);
  const [level, setLevel] = useState(lesson.level as Level);
  const [topic, setTopic] = useState(lesson.topic);
  const [description, setDescription] = useState(lesson.description);
  const [lines, setLines] = useState<LineDraft[]>(() =>
    data.lines.map((line) => ({
      id: line.id,
      start: String(line.start),
      end: String(line.end),
      text: line.text,
      translation: line.translation,
    })),
  );
  const [expressions, setExpressions] = useState<ExpressionDraft[]>(() =>
    data.expressions.map((e) => ({
      id: e.id,
      phrase: e.phrase,
      meaning: e.meaning,
      example: e.example,
      lineId: e.lineId ?? NO_LINE,
    })),
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function upload(file: File) {
    if (file.size > MAX_CLIP_BYTES) {
      toast.error("Clips can be up to 50 MB");
      return;
    }
    setUploading(true);
    try {
      const response = await fetch(`/clips/${lesson.id}`, {
        method: "PUT",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Upload failed");
      }
      await router.invalidate();
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await saveLesson({
        data: {
          id: lesson.id,
          fields: { title, language, level, topic, description },
          lines: lines.map((line) => ({
            id: line.id,
            start: Number(line.start),
            end: Number(line.end),
            text: line.text,
            translation: line.translation,
          })),
          expressions: expressions.map((e) => ({
            id: e.id,
            phrase: e.phrase,
            meaning: e.meaning,
            example: e.example,
            lineId: e.lineId === NO_LINE ? null : e.lineId,
          })),
        },
      });
      toast.success("Lesson saved");
      await router.invalidate();
    } catch (cause) {
      setError(readable(cause));
    } finally {
      setSaving(false);
    }
  }

  async function togglePublished() {
    try {
      await publishLesson({
        data: { id: lesson.id, published: !lesson.published },
      });
      await router.invalidate();
    } catch (cause) {
      toast.error(errorMessage(cause));
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await deleteLesson({ data: { id: lesson.id } });
      await navigate({ to: "/lessons" });
    } catch (cause) {
      toast.error(errorMessage(cause));
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const updateLine = (index: number, change: Partial<LineDraft>) =>
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...change } : line)),
    );
  const updateExpression = (index: number, change: Partial<ExpressionDraft>) =>
    setExpressions((prev) =>
      prev.map((e, i) => (i === index ? { ...e, ...change } : e)),
    );
  const lineChoices = [
    { value: NO_LINE, label: "No line" },
    ...lines.map((line, i) => ({
      value: line.id,
      label: `${i + 1}. ${line.text || "(empty)"}`,
    })),
  ];

  return (
    <AppShell nav={<Nav />}>
      <PageHeader
        backLink={
          <BackLink to="/lessons/$lessonId" params={{ lessonId: lesson.id }}>
            {lesson.title}
          </BackLink>
        }
        title="Edit lesson"
        description={
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              data-testid="publish-state"
              variant={lesson.published ? "success" : "warning"}
            >
              {lesson.published ? "Published" : "Draft"}
            </Badge>
            {stats ? (
              <span data-testid="lesson-stats">
                {stats.completions} completed · {stats.learners} took the quiz ·
                average best {stats.averageScore}%
              </span>
            ) : null}
          </div>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => void togglePublished()}>
              {lesson.published ? "Unpublish" : "Publish"}
            </Button>
            <Button
              variant="destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 aria-hidden />
              Delete lesson
            </Button>
          </>
        }
      />

      <section className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="language">Language</Label>
            <ChoiceSelect
              id="language"
              label="Language"
              className="w-full"
              value={language}
              choices={LANGUAGES.map((l) => ({
                value: l,
                label: LANGUAGE_LABELS[l],
              }))}
              onChange={(v) => setLanguage(v as Language)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="level">Level</Label>
            <ChoiceSelect
              id="level"
              label="Level"
              className="w-full"
              value={level}
              choices={LEVELS.map((l) => ({
                value: l,
                label: LEVEL_LABELS[l],
              }))}
              onChange={(v) => setLevel(v as Level)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="topic">Topic</Label>
            <Input
              id="topic"
              value={topic}
              maxLength={60}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            maxLength={500}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight">Clip</h2>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInput}
            type="file"
            accept="video/*,audio/*"
            data-testid="clip-input"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
          <Button
            variant="outline"
            pending={uploading}
            onClick={() => fileInput.current?.click()}
          >
            <Upload aria-hidden />
            {lesson.hasClip ? "Replace clip" : "Upload clip"}
          </Button>
          <span
            data-testid="clip-status"
            className="text-sm text-muted-foreground"
          >
            {lesson.hasClip
              ? `${lesson.clipType} · ${((lesson.clipSize ?? 0) / 1024 / 1024).toFixed(1)} MB`
              : "Video or audio, up to 50 MB"}
          </span>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight">Subtitles</h2>
        {lines.map((line, index) => {
          const n = index + 1;
          return (
            <div
              key={line.id}
              className="grid gap-2 rounded-xl border border-border bg-card p-3 shadow-xs sm:grid-cols-[5rem_5rem_minmax(0,1fr)_auto]"
            >
              <Input
                aria-label={`Line ${n} start`}
                placeholder="Start (s)"
                inputMode="decimal"
                value={line.start}
                onChange={(e) => updateLine(index, { start: e.target.value })}
              />
              <Input
                aria-label={`Line ${n} end`}
                placeholder="End (s)"
                inputMode="decimal"
                value={line.end}
                onChange={(e) => updateLine(index, { end: e.target.value })}
              />
              <div className="space-y-2">
                <Input
                  aria-label={`Line ${n} text`}
                  placeholder="Line"
                  value={line.text}
                  onChange={(e) => updateLine(index, { text: e.target.value })}
                />
                <Input
                  aria-label={`Line ${n} translation`}
                  placeholder="Translation"
                  value={line.translation}
                  onChange={(e) =>
                    updateLine(index, { translation: e.target.value })
                  }
                />
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove line ${n}`}
                onClick={() =>
                  setLines((prev) => prev.filter((_, i) => i !== index))
                }
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          );
        })}
        <Button
          variant="outline"
          onClick={() => {
            const last = lines.at(-1);
            const start = last ? Number(last.end) || 0 : 0;
            setLines((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                start: String(start),
                end: String(start + 2),
                text: "",
                translation: "",
              },
            ]);
          }}
        >
          <Plus aria-hidden />
          Add line
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight">
          Key expressions
        </h2>
        {expressions.map((expression, index) => {
          const n = index + 1;
          return (
            <div
              key={expression.id}
              className="grid gap-2 rounded-xl border border-border bg-card p-3 shadow-xs sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  aria-label={`Expression ${n} phrase`}
                  placeholder="Phrase"
                  value={expression.phrase}
                  onChange={(e) =>
                    updateExpression(index, { phrase: e.target.value })
                  }
                />
                <Input
                  aria-label={`Expression ${n} meaning`}
                  placeholder="Meaning"
                  value={expression.meaning}
                  onChange={(e) =>
                    updateExpression(index, { meaning: e.target.value })
                  }
                />
                <Input
                  aria-label={`Expression ${n} example`}
                  placeholder="Example sentence"
                  value={expression.example}
                  onChange={(e) =>
                    updateExpression(index, { example: e.target.value })
                  }
                />
                <ChoiceSelect
                  label={`Expression ${n} line`}
                  testId={`expression-${n}-line`}
                  className="w-full"
                  value={
                    lines.some((l) => l.id === expression.lineId)
                      ? expression.lineId
                      : NO_LINE
                  }
                  choices={lineChoices}
                  onChange={(v) => updateExpression(index, { lineId: v })}
                />
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove expression ${n}`}
                onClick={() =>
                  setExpressions((prev) => prev.filter((_, i) => i !== index))
                }
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          );
        })}
        <Button
          variant="outline"
          onClick={() =>
            setExpressions((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                phrase: "",
                meaning: "",
                example: "",
                lineId: NO_LINE,
              },
            ])
          }
        >
          <Plus aria-hidden />
          Add expression
        </Button>
      </section>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button pending={saving} onClick={() => void save()}>
        Save lesson
      </Button>

      {confirmDelete ? (
        <ConfirmDialog
          title="Delete this lesson?"
          confirmLabel="Delete"
          destructive
          pending={deleting}
          onConfirm={() => void remove()}
          onClose={() => setConfirmDelete(false)}
        >
          Its clip, subtitles, expressions and everyone's quiz results go with
          it.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}

/** A validation error's first message instead of its JSON. */
function readable(cause: unknown): string {
  const message = errorMessage(cause);
  try {
    const issues = JSON.parse(message) as { message?: string }[];
    if (Array.isArray(issues) && issues[0]?.message) return issues[0].message;
  } catch {
    // Not JSON: the message as it is.
  }
  return message;
}
