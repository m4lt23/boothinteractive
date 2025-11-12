import { cn } from "@/lib/utils";

export function Chip({
  active,
  children,
  onClick,
  className,
  disabled,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm leading-tight",
        "border transition-colors select-none",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-foreground border-muted-foreground/20 hover:bg-muted",
        disabled && "opacity-60 cursor-not-allowed",
        className
      )}
    >
      {children}
    </button>
  );
}