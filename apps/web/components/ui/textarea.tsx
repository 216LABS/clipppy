import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-24 w-full rounded-xl border border-line bg-black/20 px-3 py-2 text-sm text-paper outline-none placeholder:text-mist focus:border-lime",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
