import { Link } from "@tanstack/react-router";

const LINK =
  "text-sm text-muted-foreground transition-colors hover:text-foreground";
const ACTIVE = { className: "text-foreground font-medium" };

/** The app's pages, in the AppShell bar. */
export function Nav() {
  return (
    <nav className="flex items-center gap-4">
      <Link
        to="/"
        className={LINK}
        activeProps={ACTIVE}
        activeOptions={{ exact: true }}
      >
        Home
      </Link>
      <Link to="/lessons" className={LINK} activeProps={ACTIVE}>
        Lessons
      </Link>
      <Link to="/saved" className={LINK} activeProps={ACTIVE}>
        Saved
      </Link>
    </nav>
  );
}
