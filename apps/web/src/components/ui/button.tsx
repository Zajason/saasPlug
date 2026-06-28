import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium shadow-sm transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-blue-700 focus-visible:ring-2 focus-visible:ring-blue-200 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "border border-gray-950 bg-gray-950 text-white hover:bg-gray-800 active:bg-gray-700",
        destructive:
          "border border-red-700 bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus-visible:ring-red-200",
        outline:
          "border border-gray-300 bg-white text-gray-900 hover:border-gray-400 hover:bg-gray-100 active:bg-gray-200",
        secondary:
          "border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 active:bg-blue-200",
        ghost:
          "border border-gray-200 bg-gray-100 text-gray-900 hover:bg-gray-200 active:bg-gray-300",
        link: "border border-transparent bg-blue-50 text-blue-800 shadow-none underline-offset-4 hover:bg-blue-100 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
