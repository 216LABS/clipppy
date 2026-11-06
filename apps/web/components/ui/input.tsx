import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-xl border border-line bg-black/20 px-3 text-sm text-paper outline-none placeholder:text-mist focus:border-lime",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
