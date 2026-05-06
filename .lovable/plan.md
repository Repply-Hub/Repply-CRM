I will add the "Contato" field to the Negócios (Pedidos) import process and fix the mapping conflict where "Contato" columns might be incorrectly identified as "Observações".

### Technical changes:
- **`src/components/import-pedidos/importPedidosUtils.ts`**:
    - Added `contato` to the `FieldKey` type.
    - Added a new `contato` field to the `FIELDS` array.
    - Added automatic detection rules for "Contato" with a high priority score (100).
    - Updated `EMPTY_MAPPING` and `MIN_SCORE` to include the new field.
    - Refined the "Observações" detection patterns to prevent false positives with "Contato" (though the primary fix is having a higher-priority "Contato" match).
- **`src/components/ImportPedidosDialog.tsx`**:
    - Updated `getMappedRows` to extract the "Contato" value from the mapped spreadsheet column.
    - Updated `handleImport` to ensure the "Contato" value is saved into the `campos_extras` (since the database doesn't have a dedicated contact column for orders, matching the project's pattern for extra fields).

This ensures that when a spreadsheet has a "Contato" column, it is automatically recognized as the contact person and imported correctly as an extra field in the Negócio, rather than being merged into "Observações".
