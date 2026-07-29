export const ErrorMessage = ({ children }: { children: React.ReactNode }) => (
  <div
    role="alert"
    aria-live="assertive"
    className="border-status-danger/30 bg-status-danger/10 relative mt-6 rounded-card border px-6 py-4 font-mono text-sm leading-6 text-status-danger shadow-surface"
  >
    {children}
  </div>
);
