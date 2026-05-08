import * as React from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { DayPicker, DropdownProps } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  const isDropdownMode = props.captionLayout === "dropdown" || props.captionLayout === "dropdown-buttons";

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center gap-2",
        caption_label: "text-sm font-medium hidden",
        caption_dropdowns: "flex justify-center gap-2",
        vhidden: "hidden",
        dropdown: "bg-transparent border-none text-xs font-medium focus:ring-0 cursor-pointer p-0",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(buttonVariants({ variant: "ghost" }), "h-9 w-9 p-0 font-normal aria-selected:opacity-100"),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ ..._props }) => null,
        IconRight: ({ ..._props }) => null,
        Dropdown: ({ value, onChange, children, ..._props }: DropdownProps) => {
          const options = React.Children.toArray(children) as React.ReactElement<React.HTMLProps<HTMLOptionElement>>[];
          const selected = options.find((child) => child.props.value === value);
          const isYear = _props.name === "years";
          const [searchTerm, setSearchTerm] = React.useState("");
          const inputRef = React.useRef<HTMLInputElement>(null);

          const [isOpen, setIsOpen] = React.useState(false);

          React.useEffect(() => {
            if (isYear && isOpen) {
              const timer = setTimeout(() => {
                inputRef.current?.focus();
              }, 10);
              return () => clearTimeout(timer);
            }
          }, [isYear, isOpen]);

          const handleChange = (newValue: string) => {
            onChange?.({ target: { value: newValue } } as React.ChangeEvent<HTMLSelectElement>);
          };

          const filteredOptions = isYear
            ? options.filter(option => option.props.children?.toString().toLowerCase().includes(searchTerm.toLowerCase()))
            : options;

          return (
            <Select value={value?.toString()} onValueChange={handleChange} open={isOpen} onOpenChange={setIsOpen}>
              <SelectTrigger className="h-7 w-fit min-w-[70px] border-none bg-transparent px-2 py-0 text-xs font-medium hover:bg-accent focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 capitalize">
                <SelectValue>{selected?.props.children}</SelectValue>
              </SelectTrigger>
              <SelectContent position="popper" className={cn("max-h-[300px]", isYear ? "min-w-[145px] w-[145px]" : "min-w-[120px]")}>
                {isYear && (
                  <div className="flex items-center border-b px-3 py-2 sticky -top-1 -mx-1 -mt-1 mb-1 bg-background z-10">
                    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <Input
                      ref={inputRef}
                      placeholder="Buscar ano..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                      className="h-8 w-full border-none focus-visible:ring-0 focus-visible:ring-offset-0 text-xs p-0"
                    />
                  </div>
                )}
                {filteredOptions.map((option) => (
                  <SelectItem key={option.props.value?.toString()} value={option.props.value?.toString() ?? ""} className={!isYear ? "capitalize" : ""}>
                    {option.props.children}
                  </SelectItem>
                ))}
                {isYear && filteredOptions.length === 0 && (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    Nenhum ano encontrado.
                  </div>
                )}
              </SelectContent>
            </Select>
          );
        },
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };