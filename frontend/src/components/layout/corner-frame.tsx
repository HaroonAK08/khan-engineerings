import { cn } from "@/lib/utils";

const CORNERS = [
  "left-0 top-0 border-l-2 border-t-2",
  "right-0 top-0 border-r-2 border-t-2",
  "left-0 bottom-0 border-l-2 border-b-2",
  "right-0 bottom-0 border-r-2 border-b-2",
] as const;

export function CornerFrame({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("relative p-6", className)}>
      {CORNERS.map((position) => (
        <span
          key={position}
          aria-hidden
          className={cn("absolute size-5 border-primary/70", position)}
        />
      ))}
      {children}
    </div>
  );
}
