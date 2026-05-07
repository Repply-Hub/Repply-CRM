import React from 'react';
import { ChevronDown, LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface StandardPopoverMenuProps {
    label: string;
    icon: LucideIcon;
    children: React.ReactNode;
    variant?: 'trigger' | 'submenu';
    className?: string;
    popoverClassName?: string;
    side?: 'top' | 'bottom' | 'left' | 'right';
    align?: 'start' | 'center' | 'end';
    sideOffset?: number;
    badge?: string | number;
}

export const StandardPopoverMenu = ({
    label,
    icon: Icon,
    children,
    variant = 'submenu',
    className,
    popoverClassName,
    side = 'bottom',
    align = 'start',
    sideOffset = 10,
    badge
}: StandardPopoverMenuProps) => {
    const isTrigger = variant === 'trigger';

    return (
        <Popover modal={false}>
            <PopoverTrigger asChild>
                {isTrigger ? (
                    <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                            "h-10 gap-2.5 rounded-lg border-border/60 bg-background px-4 font-medium transition-all hover:border-primary/50 hover:bg-primary/[0.02] data-[state=open]:bg-primary/10 data-[state=open]:text-primary data-[state=open]:border-primary/50 shadow-sm active:scale-[0.98] group",
                            className
                        )}
                    >
                        <Icon className="h-4 w-4" />
                        <span>{label}</span>
                        {badge !== undefined && (
                            <span className="ml-1 h-5 min-w-[20px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">
                                {badge}
                            </span>
                        )}
                        <ChevronDown className="h-3.5 w-3.5 opacity-50 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                    </Button>
                ) : (
                    <button className={cn(
                        "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium hover:bg-muted/80 data-[state=open]:bg-primary/10 data-[state=open]:text-primary transition-colors group text-left",
                        className
                    )}>
                        <div className="flex items-center gap-3">
                            <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                            <span>{label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {badge !== undefined && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border-none">
                                    {badge}
                                </span>
                            )}
                            <ChevronDown className="h-3.5 w-3.5 opacity-40 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                        </div>
                    </button>
                )}
            </PopoverTrigger>
            <PopoverContent 
                side={side} 
                align={align} 
                sideOffset={sideOffset} 
                className={cn("w-64 p-0 shadow-2xl border-border/40 z-[60] bg-background overflow-hidden", popoverClassName)}
            >
                <div className="flex flex-col h-full">
                    <div className="px-4 py-3 border-b border-border/50 bg-muted/20">
                        <h4 className="font-bold text-[10px] uppercase tracking-[0.15em] text-muted-foreground/80 leading-none">{label}</h4>
                    </div>
                    <div className="p-1.5 flex flex-col gap-0.5">
                        {children}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
};

interface StandardMenuItemProps {
    label: string;
    icon: LucideIcon;
    onClick?: () => void;
    variant?: 'default' | 'destructive';
    badge?: string | number;
    disabled?: boolean;
    className?: string;
}

export const StandardMenuItem = ({
    label,
    icon: Icon,
    onClick,
    variant = 'default',
    badge,
    disabled,
    className
}: StandardMenuItemProps) => (
    <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={cn(
            "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-all group",
            variant === 'destructive' 
                ? "text-destructive hover:bg-destructive/10" 
                : "hover:bg-muted/80",
            disabled && "opacity-50 cursor-not-allowed",
            className
        )}
    >
        <div className="flex items-center gap-3">
            <Icon className={cn(
                "h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors",
                variant === 'destructive' && "text-destructive/70 group-hover:text-destructive"
            )} />
            <span className="truncate">{label}</span>
        </div>
        {badge !== undefined && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border-none ml-2">
                {badge}
            </span>
        )}
    </button>
);
