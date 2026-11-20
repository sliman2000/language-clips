import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { GraduationCap, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/client/components/AppShell";
import { ChoiceSelect } from "@/client/components/ChoiceSelect";
import { EmptyState } from "@/client/components/EmptyState";
import { Nav } from "@/client/components/Nav";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import { errorMessage } from "@/client/lib/format";
import { getSaved, removeSaved, setLearned } from "@/serverFunctions/study";
import { LANGUAGES, LANGUAGE_LABELS, type Language } from "@/shared/study";

export const Route = createFileRoute("/saved")({
  validateSearch: z.object({
    language: z.enum(LANGUAGES).optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getSaved({ data: deps }),
  head: () => ({ meta: [{ title: "Saved · Language Clips" }] }),
  component: SavedPage,
});

const ALL = "all";

type Item = Awaited<ReturnType<typeof getSaved>>[number];

function SavedPage() {
  const items = Route.useLoaderData();
  const { language } = Route.useSearch();
  const navigate = useNavigate({ from: "/saved" });
  const router = useRouter();
  const [reviewing, setReviewing] = useState(false);

  async function change(work: () => Promise<unknown>) {
    try {
      await work();
      await router.invalidate();
    } catch (cause) {
      toast.error(errorMessage(cause));
    }
  }

  return (
    <AppShell nav={<Nav />}>
      <PageHeader
        title="Saved expressions"
        actions={
          items.length > 0 && !reviewing ? (
            <Button onClick={() => setReviewing(true)}>
              <GraduationCap aria-hidden />
              Review
            </Button>
          ) : null
        }
      />

      <ChoiceSelect
        label="Language"
        testId="saved-language"
        value={language ?? ALL}
        choices={[
          { value: ALL, label: "All languages" },
          ...LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_LABELS[l] })),
        ]}
        onChange={(v) =>
          void navigate({
            search: { language: v === ALL ? undefined : (v as Language) },
          })
        }
      />

      {reviewing && items.length > 0 ? (
        <Review items={items} onDone={() => setReviewing(false)} />
      ) : null}

      {items.length === 0 ? (
        language ? (
          <EmptyState kind="filtered" title="Nothing saved in this language" />
        ) : (
          <EmptyState
            title="Nothing saved yet"
            description="Save key expressions from a lesson and they appear here."
          />
        )
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          {items.map((item) => (
            <li
              key={item.expressionId}
              data-testid="saved-item"
              className="flex items-start gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                <p
                  className={
                    item.learned
                      ? "font-medium text-muted-foreground"
                      : "font-medium"
                  }
                >
                  {item.phrase}
                </p>
                <p className="text-muted-foreground">{item.meaning}</p>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Badge variant="outline">
                    {LANGUAGE_LABELS[item.language as Language]}
                  </Badge>
                  <Link
                    to="/lessons/$lessonId"
                    params={{ lessonId: item.lessonId }}
                    className="hover:underline"
                  >
                    {item.lessonTitle}
                  </Link>
                </p>
              </div>
              <label className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  aria-label="Learned"
                  checked={item.learned}
                  onCheckedChange={(learned) =>
                    void change(() =>
                      setLearned({
                        data: { expressionId: item.expressionId, learned },
                      }),
                    )
                  }
                />
                Learned
              </label>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Remove"
                className="text-muted-foreground hover:text-destructive"
                onClick={() =>
                  void change(() =>
                    removeSaved({ data: { expressionId: item.expressionId } }),
                  )
                }
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

/** One phrase at a time; the meaning stays hidden until asked for. */
function Review({ items, onDone }: { items: Item[]; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const item = items[index % items.length]!;
  return (
    <section
      data-testid="review-card"
      className="space-y-4 rounded-xl border border-border bg-card p-6 text-center text-card-foreground shadow-xs"
    >
      <p className="text-xs text-muted-foreground">
        {(index % items.length) + 1} / {items.length}
      </p>
      <p data-testid="review-phrase" className="text-2xl font-semibold">
        {item.phrase}
      </p>
      {revealed ? (
        <div data-testid="review-meaning" className="space-y-1">
          <p>{item.meaning}</p>
          {item.example ? (
            <p className="text-sm text-muted-foreground italic">
              {item.example}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex justify-center gap-2">
        {revealed ? null : (
          <Button variant="outline" onClick={() => setRevealed(true)}>
            Show meaning
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => {
            setIndex((i) => i + 1);
            setRevealed(false);
          }}
        >
          Next
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
    </section>
  );
}
