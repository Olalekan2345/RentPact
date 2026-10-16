/** The "or" rule between Google sign-in and email-code sign-in. */
export function SignInDivider() {
  return (
    <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-ink-soft" role="separator">
      <span className="h-px flex-1 bg-forest-100" />
      or
      <span className="h-px flex-1 bg-forest-100" />
    </div>
  );
}
