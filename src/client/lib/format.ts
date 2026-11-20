/** 75.5 as "1:15". */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Something went wrong";
}
