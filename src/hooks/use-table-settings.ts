import { useState, useCallback, useEffect } from 'react';
import type { ColumnDefinition } from '@/components/ColumnSettings';

interface TableSettingsOptions {
  key: string;
  defaultColumns: ColumnDefinition[];
  defaultPageSize?: number;
}

export function useTableSettings({ key, defaultColumns, defaultPageSize = 10 }: TableSettingsOptions) {
  // 1. Initial State from LocalStorage or Defaults
  const [columns, setColumns] = useState<ColumnDefinition[]>(() => {
    const saved = localStorage.getItem(`${key}_all_columns`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Merge saved custom columns with current default columns
        const customOnes = parsed.filter((c: ColumnDefinition) => c.isCustom);
        return [...defaultColumns, ...customOnes];
      } catch (e) {
        return defaultColumns;
      }
    }
    return defaultColumns;
  });

  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const saved = localStorage.getItem(`${key}_visible_columns`);
    return saved ? JSON.parse(saved) : defaultColumns.map(c => c.id);
  });

  const [customLabels, setCustomLabels] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem(`${key}_custom_labels`);
    return saved ? JSON.parse(saved) : {};
  });

  const [pageSize, setPageSize] = useState<number>(() => {
    const saved = localStorage.getItem(`${key}_page_size`);
    return saved ? Number(saved) : defaultPageSize;
  });

  // 2. Persistence
  useEffect(() => {
    localStorage.setItem(`${key}_all_columns`, JSON.stringify(columns));
  }, [key, columns]);

  useEffect(() => {
    localStorage.setItem(`${key}_visible_columns`, JSON.stringify(visibleColumns));
  }, [key, visibleColumns]);

  useEffect(() => {
    localStorage.setItem(`${key}_custom_labels`, JSON.stringify(customLabels));
  }, [key, customLabels]);

  useEffect(() => {
    localStorage.setItem(`${key}_page_size`, String(pageSize));
  }, [key, pageSize]);

  // 3. Actions
  const handleRename = useCallback((columnId: string, newLabel: string) => {
    setCustomLabels(prev => ({ ...prev, [columnId]: newLabel }));
  }, []);

  const handleAddColumn = useCallback((label: string) => {
    const id = `custom_${label.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
    const newCol: ColumnDefinition = { id, label, isCustom: true };
    setColumns(prev => [...prev, newCol]);
    setVisibleColumns(prev => [...prev, id]);
  }, []);

  const handleRemoveColumn = useCallback((columnId: string) => {
    setColumns(prev => prev.filter(c => c.id !== columnId));
    setVisibleColumns(prev => prev.filter(id => id !== columnId));
    setCustomLabels(prev => {
      const next = { ...prev };
      delete next[columnId];
      return next;
    });
  }, []);

  const getLabel = useCallback((columnId: string) => {
    const col = columns.find(c => c.id === columnId);
    return customLabels[columnId] || col?.label || columnId;
  }, [columns, customLabels]);

  const currentColumns = columns.map(col => ({
    ...col,
    customLabel: customLabels[col.id]
  }));

  return {
    columns: currentColumns,
    visibleColumns,
    setVisibleColumns,
    pageSize,
    setPageSize,
    handleRename,
    handleAddColumn,
    handleRemoveColumn,
    getLabel,
  };
}
