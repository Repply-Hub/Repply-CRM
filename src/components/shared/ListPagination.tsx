import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type PageToken = number | 'ellipsis';

interface ListPaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
  itemLabelPlural?: string;
  className?: string;
}

const MAX_VISIBLE_PAGES = 7;
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 50, 100, 200, 500, 1000];

function getPageTokens(currentPage: number, totalPages: number): PageToken[] {
  if (totalPages <= MAX_VISIBLE_PAGES) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis', totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [1, 'ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages];
}

export function ListPagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  itemLabel = 'item',
  itemLabelPlural,
  className,
}: ListPaginationProps) {
  const safeTotalItems = totalItems || 0;
  const safeTotalPages = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(page, 1), safeTotalPages);
  const start = safeTotalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, safeTotalItems);
  const summaryLabel = safeTotalItems === 1 ? itemLabel : itemLabelPlural ?? `${itemLabel}s`;
  const pageTokens = getPageTokens(safePage, safeTotalPages);

  const handlePageChange = (nextPage: number) => {
    if (nextPage < 1 || nextPage > safeTotalPages || nextPage === safePage) {
      return;
    }

    onPageChange(nextPage);
  };

  return (
    <div className={cn('flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="flex items-center gap-2 flex-wrap text-xs sm:text-sm text-muted-foreground">
        <span className="whitespace-nowrap">
          {start}–{end} de {safeTotalItems} {summaryLabel}
        </span>

        {onPageSizeChange && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <div className="flex items-center gap-1.5">
              <span className="whitespace-nowrap">Exibir</span>
              <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
                <SelectTrigger className="h-7 w-fit min-w-[60px] shrink-0 text-xs sm:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pageSizeOptions.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>

      {/* Always show pagination controls for visual consistency if items exist */}
      <Pagination className="mx-0 w-auto justify-start sm:justify-end">
          <PaginationContent className="flex-wrap">
            <PaginationItem>
              <PaginationLink
                href="#"
                size="icon"
                aria-label="Página anterior"
                className={cn('h-8 w-8', safePage === 1 && 'pointer-events-none opacity-50')}
                onClick={(event) => {
                  event.preventDefault();
                  handlePageChange(safePage - 1);
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </PaginationLink>
            </PaginationItem>

            {pageTokens.map((token, index) => (
              <PaginationItem key={`${token}-${index}`} className="hidden sm:list-item">
                {token === 'ellipsis' ? (
                  <PaginationEllipsis />
                ) : (
                  <PaginationLink
                    href="#"
                    isActive={safePage === token}
                    aria-label={`Ir para página ${token}`}
                    className="h-8 w-8"
                    onClick={(event) => {
                      event.preventDefault();
                      handlePageChange(token);
                    }}
                  >
                    {token}
                  </PaginationLink>
                )}
              </PaginationItem>
            ))}

            <PaginationItem className="sm:hidden">
              <span className="flex h-8 items-center px-2 text-xs text-muted-foreground">
                {safePage}/{safeTotalPages}
              </span>
            </PaginationItem>

            <PaginationItem>
              <PaginationLink
                href="#"
                size="icon"
                aria-label="Próxima página"
                className={cn('h-8 w-8', safePage === safeTotalPages && 'pointer-events-none opacity-50')}
                onClick={(event) => {
                  event.preventDefault();
                  handlePageChange(safePage + 1);
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </PaginationLink>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
    </div>
  );
}
