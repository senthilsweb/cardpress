import * as React from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { DayPicker, getDefaultClassNames } from "react-day-picker";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

const arrows = { left: ChevronLeft, right: ChevronRight, up: ChevronUp, down: ChevronDown };

function Calendar({ className, classNames, showOutsideDays = false, ...props }: CalendarProps) {
  const base = getDefaultClassNames();
  const nav = cn(buttonVariants({ variant: "outline", size: "icon-sm" }), "h-7 w-7 aria-disabled:opacity-40");
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("w-fit text-sm", className)}
      classNames={{
        root: base.root,
        months: "relative flex flex-col gap-4 sm:flex-row",
        month: "flex flex-col gap-2",
        month_caption: "flex h-7 items-center justify-center",
        caption_label: "text-sm font-medium",
        nav: "absolute inset-x-0 top-0 z-10 flex items-center justify-between",
        button_previous: nav,
        button_next: nav,
        month_grid: "border-collapse",
        weekdays: "flex",
        weekday: "w-8 text-center text-[11px] font-normal text-muted-foreground",
        week: "mt-1 flex",
        day: "h-8 w-8 p-0 text-center",
        day_button: "h-8 w-8 cursor-pointer rounded-md tabular-nums hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent",
        selected: "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
        range_start: "rounded-l-md bg-accent",
        range_middle: "bg-accent [&>button]:bg-transparent! [&>button]:text-foreground!",
        range_end: "rounded-r-md bg-accent",
        today: "[&>button]:font-semibold [&>button]:underline [&>button]:underline-offset-4",
        outside: "text-muted-foreground",
        disabled: "text-muted-foreground opacity-40",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation = "left", className: c }) => { const Icon = arrows[orientation]; return <Icon aria-hidden className={cn("h-4 w-4", c)} />; },
      }}
      {...props}
    />
  );
}
export { Calendar };
