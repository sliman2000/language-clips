import { Link, createFileRoute } from "@tanstack/react-router";
import { Check, Mic, Play, Star, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { LessonNotFound } from "@/client/components/LessonNotFound";
import { Nav } from "@/client/components/Nav";
import { BackLink, PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/client/components/ui/radio-group";
import { errorMessage } from "@/client/lib/format";
import { getQuiz, submitQuiz } from "@/serverFunctions/study";
import type { QuizQuestion } from "@/shared/study";

export const Route = createFileRoute("/lessons/$lessonId/quiz")({
  loader: ({ params }) => getQuiz({ data: { id: params.lessonId } }),
  head: () => ({ meta: [{ title: "Quiz · Language Clips" }] }),
  component: QuizPage,
});

type Result = Awaited<ReturnType<typeof submitQuiz>>;

const KIND_LABELS: Record<QuizQuestion["kind"], string> = {
  listening: "Listening",
  meaning: "Meaning",
  speaking: "Speaking",
};

function QuizPage() {
  const quiz = Route.useLoaderData();
  const { lessonId } = Route.useParams();
  const media = useRef<HTMLAudioElement | null>(null);
  const stopAt = useRef<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!quiz) return <LessonNotFound />;

  const set = (id: string, value: string) =>
    setAnswers((prev) => ({ ...prev, [id]: value }));

  function playLine(start: number, end: number) {
    const el = media.current;
    if (!el) return;
    el.currentTime = start;
    stopAt.current = end;
    void el.play().catch(() => undefined);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const graded = await submitQuiz({
        data: {
          lessonId,
          answers: quiz!.questions.map((q) => ({
            questionId: q.id,
            answer: answers[q.id] ?? "",
          })),
        },
      });
      setResult(graded);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  const back = (
    <BackLink to="/lessons/$lessonId" params={{ lessonId }}>
      {quiz.title}
    </BackLink>
  );

  return (
    <AppShell nav={<Nav />}>
      <PageHeader backLink={back} title="Quiz" />
      <audio
        ref={media}
        src={`/clips/${lessonId}`}
        preload="metadata"
        onTimeUpdate={(e) => {
          if (
            stopAt.current !== null &&
            e.currentTarget.currentTime >= stopAt.current
          ) {
            e.currentTarget.pause();
            stopAt.current = null;
          }
        }}
        hidden
      />

      {quiz.questions.length === 0 ? (
        <EmptyState title="This lesson has no quiz yet" />
      ) : result ? (
        <ResultView
          result={result}
          questions={quiz.questions}
          onRetry={() => {
            setAnswers({});
            setResult(null);
          }}
          lessonId={lessonId}
        />
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <ol className="space-y-3">
            {quiz.questions.map((question, index) => (
              <li
                key={question.id}
                data-testid="question"
                className="space-y-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xs"
              >
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{index + 1}.</span>
                  <Badge variant="outline">{KIND_LABELS[question.kind]}</Badge>
                </div>
                {question.kind === "listening" ? (
                  <>
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => playLine(question.start, question.end)}
                      >
                        <Play aria-hidden />
                        Play
                      </Button>
                      <p className="font-medium">{question.prompt}</p>
                    </div>
                    <Input
                      aria-label="Missing words"
                      placeholder="Missing words"
                      value={answers[question.id] ?? ""}
                      onChange={(e) => set(question.id, e.target.value)}
                    />
                  </>
                ) : question.kind === "meaning" ? (
                  <>
                    <p className="font-medium">{question.phrase}</p>
                    <RadioGroup
                      value={answers[question.id] ?? null}
                      onValueChange={(value) => set(question.id, String(value))}
                    >
                      {question.choices.map((choice) => (
                        <label
                          key={choice}
                          className="flex cursor-pointer items-center gap-2 text-sm"
                        >
                          <RadioGroupItem value={choice} />
                          {choice}
                        </label>
                      ))}
                    </RadioGroup>
                  </>
                ) : (
                  <SpeakingAnswer
                    meaning={question.meaning}
                    language={quiz.language}
                    value={answers[question.id] ?? ""}
                    onChange={(value) => set(question.id, value)}
                  />
                )}
              </li>
            ))}
          </ol>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" pending={pending}>
            Check answers
          </Button>
        </form>
      )}
    </AppShell>
  );
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
}
type RecognitionClass = new () => Recognition;

function recognitionClass(): RecognitionClass | null {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionClass;
    webkitSpeechRecognition?: RecognitionClass;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function SpeakingAnswer({
  meaning,
  language,
  value,
  onChange,
}: {
  meaning: string;
  language: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [canListen, setCanListen] = useState(false);
  const [listening, setListening] = useState(false);
  useEffect(() => setCanListen(recognitionClass() !== null), []);

  function listen() {
    const Recognizer = recognitionClass();
    if (!Recognizer) return;
    const recognition = new Recognizer();
    recognition.lang = language === "korean" ? "ko-KR" : "en-US";
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) onChange(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    setListening(true);
    recognition.start();
  }

  return (
    <>
      <p>
        Say the phrase that means{" "}
        <span className="font-medium">“{meaning}”</span>
      </p>
      <div className="flex gap-2">
        {canListen ? (
          <Button
            type="button"
            variant={listening ? "default" : "outline"}
            onClick={listen}
            disabled={listening}
          >
            <Mic aria-hidden />
            {listening ? "Listening…" : "Speak"}
          </Button>
        ) : null}
        <Input
          aria-label="Your answer"
          placeholder="Your answer"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </>
  );
}

function ResultView({
  result,
  questions,
  onRetry,
  lessonId,
}: {
  result: Result;
  questions: QuizQuestion[];
  onRetry: () => void;
  lessonId: string;
}) {
  return (
    <section
      data-testid="quiz-result"
      className="space-y-4 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xs"
    >
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-3xl font-semibold">{result.score}%</p>
        <Badge variant={result.passed ? "success" : "warning"}>
          {result.passed ? "Passed" : "Not passed"}
        </Badge>
        {result.starsEarned > 0 ? (
          <Badge variant="info">
            <Star aria-hidden />+{result.starsEarned} stars
          </Badge>
        ) : null}
        <span className="text-sm text-muted-foreground">
          {result.correct} of {result.total} right · Best {result.bestScore}%
        </span>
      </div>
      {!result.passed ? (
        <p className="text-sm text-muted-foreground">
          Score 80% or more to complete the lesson.
        </p>
      ) : null}
      <ol className="divide-y divide-border text-sm">
        {result.results.map((item, index) => {
          const question = questions.find((q) => q.id === item.questionId);
          return (
            <li key={item.questionId} className="flex items-center gap-2 py-2">
              {item.correct ? (
                <Check className="size-4 text-success" aria-label="Right" />
              ) : (
                <X className="size-4 text-destructive" aria-label="Wrong" />
              )}
              <span className="text-muted-foreground">
                {index + 1}. {question ? KIND_LABELS[question.kind] : ""}
              </span>
              <span className="ml-auto font-medium">{item.expected}</span>
            </li>
          );
        })}
      </ol>
      <div className="flex gap-2">
        <Button onClick={onRetry}>Try again</Button>
        <Button
          variant="outline"
          render={<Link to="/lessons/$lessonId" params={{ lessonId }} />}
        >
          Back to the lesson
        </Button>
      </div>
    </section>
  );
}
