export function FilterGroup({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-[220px] ${className ?? ""}`}>
      <div className="mb-1 text-xs font-semibold tracking-wide text-foreground">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {children}
      </div>
    </div>
  );
}