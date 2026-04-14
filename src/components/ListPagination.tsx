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
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 50, 100, 200];

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
  if (totalItems === 0) {
    return null;
  }

  const safeTotalPages = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(page, 1), safeTotalPages);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, totalItems);
  const summaryLabel = totalItems === 1 ? itemLabel : itemLabelPlural ?? `${itemLabel}s`;
  const pageTokens = getPageTokens(safePage, safeTotalPages);

  const handlePageChange = (nextPage: number) => {
    if (nextPage < 1 || nextPage > safeTotalPages || nextPage === safePage) {
      return;
    }

    onPageChange(nextPage);
  };

  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <span className="text-xs sm:text-sm text-muted-foreground">
          Mostrando {start}–{end} de {totalItems} {summaryLabel} · Página {safePage} de {safeTotalPages}
        </span>

        {onPageSizeChange && (
          <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
            <span className="whitespace-nowrap">Visualizar</span>
            <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
              <SelectTrigger className="h-8 w-fit min-w-[88px] shrink-0">
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
            <span className="whitespace-nowrap">por página</span>
          </div>
        )}
      </div>

      {safeTotalPages > 1 && (
        <Pagination className="mx-0 w-full justify-start sm:w-auto sm:justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationLink
                href="#"
                size="default"
                aria-label="Página anterior"
                className={cn('gap-1 pl-2.5', safePage === 1 && 'pointer-events-none opacity-50')}
                onClick={(event) => {
                  event.preventDefault();
                  handlePageChange(safePage - 1);
                }}
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Anterior</span>
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

            <PaginationItem>
              <PaginationLink
                href="#"
                size="default"
                aria-label="Próxima página"
                className={cn('gap-1 pr-2.5', safePage === safeTotalPages && 'pointer-events-none opacity-50')}
                onClick={(event) => {
                  event.preventDefault();
                  handlePageChange(safePage + 1);
                }}
              >
                <span>Próxima</span>
                <ChevronRight className="h-4 w-4" />
              </PaginationLink>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
