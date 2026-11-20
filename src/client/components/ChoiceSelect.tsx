import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";

export interface Choice {
  value: string;
  label: string;
}

/** A Select over a short list of labelled values. */
export function ChoiceSelect({
  value,
  onChange,
  choices,
  label,
  testId,
  className,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  choices: Choice[];
  label: string;
  testId?: string;
  className?: string;
  id?: string;
}) {
  return (
    <Select
      items={choices}
      value={value}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next);
      }}
    >
      <SelectTrigger
        id={id}
        aria-label={label}
        data-testid={testId}
        className={className}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {choices.map((choice) => (
          <SelectItem key={choice.value} value={choice.value}>
            {choice.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
