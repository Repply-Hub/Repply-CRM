import { useState, useCallback, useEffect, useMemo } from 'react';
import type { ColumnDefinition, ColumnDataType } from '@/components/ColumnSettings';
import { toast } from 'sonner';

interface TablePreset {
  id: string;
  name: string;
  columns: ColumnDefinition[];
  visibleColumns: string[];
  customLabels: Record<string, string>;
  pageSize: number;
}

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
        const parsed = JSON.parse(saved) as ColumnDefinition[];
        // Remover duplicatas por ID
        const unique = Array.from(new Map(parsed.map(c => [c.id, c])).values());
        
        return unique.map(col => {
          const defaultCol = defaultColumns.find(d => d.id === col.id);
          return {
            ...col,
            locked: defaultCol ? (defaultCol.locked ?? false) : col.locked
          };
        });
      } catch (e) {
        return defaultColumns;
      }
    }
    return defaultColumns;
  });

  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const saved = localStorage.getItem(`${key}_visible_columns`);
    const initial = saved ? JSON.parse(saved) : defaultColumns.map(c => c.id);
    return Array.from(new Set(initial)) as string[];
  });

  const [customLabels, setCustomLabels] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem(`${key}_custom_labels`);
    return saved ? JSON.parse(saved) : {};
  });

  const [pageSize, setPageSize] = useState<number>(() => {
    const saved = localStorage.getItem(`${key}_page_size`);
    return saved ? Number(saved) : defaultPageSize;
  });

  const [presets, setPresets] = useState<TablePreset[]>(() => {
    const saved = localStorage.getItem(`${key}_presets`);
    return saved ? JSON.parse(saved) : [];
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

  useEffect(() => {
    localStorage.setItem(`${key}_presets`, JSON.stringify(presets));
  }, [key, presets]);

  // 3. Actions
  const handleRename = useCallback((columnId: string, newLabel: string) => {
    setCustomLabels(prev => ({ ...prev, [columnId]: newLabel }));
  }, []);

  const handleTypeChange = useCallback((columnId: string, type: ColumnDataType) => {
    setColumns(prev => prev.map(col => 
      col.id === columnId ? { ...col, type } : col
    ));
    toast.success('Tipo de coluna atualizado');
  }, []);

  const handleAddColumn = useCallback((label: string, type: ColumnDataType = 'text') => {
    const lowerLabel = label.toLowerCase().trim();
    const existing = columns.find(c => 
      c.label.toLowerCase().trim() === lowerLabel || 
      c.id.toLowerCase().trim() === lowerLabel
    );

    if (existing) {
      if (!visibleColumns.includes(existing.id)) {
        setVisibleColumns(prev => [...prev, existing.id]);
        toast.info(`A coluna "${label}" já existe e foi ativada`);
      } else {
        toast.error(`A coluna "${label}" já existe`);
      }
      return;
    }

    const id = `custom_${label.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
    const newCol: ColumnDefinition = { id, label, isCustom: true, type };
    setColumns(prev => [...prev, newCol]);
    setVisibleColumns(prev => [...prev, id]);
    toast.success(`Coluna "${label}" adicionada`);
  }, [columns, visibleColumns]);

  const handleRemoveColumn = useCallback((columnId: string) => {
    setColumns(prev => prev.filter(c => c.id !== columnId));
    setVisibleColumns(prev => prev.filter(id => id !== columnId));
    setCustomLabels(prev => {
      const next = { ...prev };
      delete next[columnId];
      return next;
    });
  }, []);

  const handleReorder = useCallback((startIndex: number, endIndex: number) => {
    setColumns(prev => {
      const result = Array.from(prev);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      
      // Sincroniza a ordem das colunas visíveis com a nova ordem geral
      setVisibleColumns(currentVisible => {
        const sortedVisible = result
          .filter(col => currentVisible.includes(col.id))
          .map(col => col.id);
        return sortedVisible;
      });
      
      return result;
    });
  }, []);

  const getLabel = useCallback((columnId: string) => {
    const col = columns.find(c => c.id === columnId);
    return customLabels[columnId] || col?.label || columnId;
  }, [columns, customLabels]);

  const savePreset = useCallback((name: string) => {
    if (!name.trim()) return;
    const newPreset: TablePreset = {
      id: Date.now().toString(),
      name: name.trim(),
      columns,
      visibleColumns,
      customLabels,
      pageSize
    };
    setPresets(prev => [...prev, newPreset]);
    toast.success(`Modelo "${name}" salvo com sucesso!`);
  }, [columns, visibleColumns, customLabels, pageSize]);

  const loadPreset = useCallback((presetId: string) => {
    const preset = presets.find(p => p.id === presetId);
    if (preset) {
      setColumns(preset.columns);
      setVisibleColumns(preset.visibleColumns);
      setCustomLabels(preset.customLabels);
      setPageSize(preset.pageSize);
      toast.success(`Modelo "${preset.name}" aplicado!`);
    }
  }, [presets]);

  const deletePreset = useCallback((presetId: string) => {
    setPresets(prev => prev.filter(p => p.id !== presetId));
    toast.success('Modelo excluído!');
  }, []);

  const currentColumns = useMemo(() => columns.map(col => ({
    ...col,
    customLabel: customLabels[col.id]
  })), [columns, customLabels]);

  const resetToDefaults = useCallback(() => {
    setColumns(defaultColumns);
    setVisibleColumns(defaultColumns.map(c => c.id));
    setCustomLabels({});
    toast.success('Configurações restauradas para o padrão');
  }, [defaultColumns]);

  return {
    columns: currentColumns,
    visibleColumns,
    setVisibleColumns,
    pageSize,
    setPageSize,
    handleRename,
    handleTypeChange,
    handleAddColumn,
    handleRemoveColumn,
    handleReorder,
    getLabel,
    presets,
    savePreset,
    loadPreset,
    deletePreset,
    resetToDefaults
  };
}
