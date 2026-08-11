import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="top-right"
      offset={{ top: "calc(5.5rem + 1rem)", right: "1rem" }}
      className="toaster group"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-primary group-[.toaster]:text-primary-foreground group-[.toaster]:border-primary group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-primary-foreground/80",
          actionButton: "group-[.toast]:bg-primary-foreground group-[.toast]:text-primary",
          cancelButton: "group-[.toast]:bg-primary-foreground/20 group-[.toast]:text-primary-foreground",
          closeButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:border-primary-foreground/30 group-[.toast]:!left-auto group-[.toast]:!right-2 group-[.toast]:!top-2",
          error:
            "group-[.toaster]:!bg-destructive group-[.toaster]:!text-destructive-foreground group-[.toaster]:!border-destructive [&_[data-description]]:!text-destructive-foreground/90 [&_[data-close-button]]:!bg-destructive [&_[data-close-button]]:!text-destructive-foreground [&_[data-close-button]]:!border-destructive-foreground/30",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
