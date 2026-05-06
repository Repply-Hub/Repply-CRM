I will implement the drag-and-drop functionality for the columns in the column options button on the Negocios page.

The `ColumnSettings` component already includes `@hello-pangea/dnd` for dragging columns, but it might need refinement or verification to ensure it works correctly within the `Negocios` context. The `useTableSettings` hook already implements a `handleReorder` function that updates both the total columns list and the visible columns order.

### Proposed Changes

1.  **Refine `ColumnSettings.tsx`**:
    *   Ensure the `DragDropContext`, `Droppable`, and `Draggable` setup is robust.
    *   Verify that `onReorder` is correctly called with the indices.
    *   Add styling to indicate draggability more clearly.

2.  **Verify `useTableSettings.ts`**:
    *   The existing `handleReorder` logic seems to reorder the base `columns` array and then recalculate `visibleColumns` based on that order. I will ensure this logic correctly reflects the user's intent for both the options list and the table header.

3.  **Update `Negocios.tsx`**:
    *   The `Negocios` page uses `useTableSettings` and passes the resulting props to `ColumnSettings`. I'll ensure the `visibleColumns` used for rendering the table header and rows respect the order defined by the columns array.

### Technical Details

*   **Library**: `@hello-pangea/dnd` (already in use).
*   **State Management**: `useTableSettings` hook manages the persistence to LocalStorage and Supabase.
*   **Ordering Logic**: When a user drags a column in the settings menu, it reorders the master `columns` list. The table view then uses `visibleColumns` filtered by the master `columns` order to render.

I will start by making sure the `Negocios.tsx` correctly uses the ordered columns for rendering the table.
