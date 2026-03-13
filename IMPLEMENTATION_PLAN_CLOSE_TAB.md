# Close Tab Confirmation Implementation Plan

Implement a confirmation dialog when closing tabs with unsaved changes.

## Proposed Changes

### [Component] [ConfirmDialog](file:///Users/imoling/projects/iml-markdown-editor/src/components/ConfirmDialog.tsx) [NEW]
- Create a reusable confirmation dialog component with options to Save, Don't Save, and Cancel.

### [Store] [appStore.ts](file:///Users/imoling/projects/iml-markdown-editor/src/stores/appStore.ts) [MODIFY]
- Add a new state `tabToClose` to track the tab pending closure during confirmation.
- Add `setTabToClose` action.
- Ensure `closeTab` remains consistent but might need to be called after confirmation.

### [Component] [TiptapEditor.tsx](file:///Users/imoling/projects/iml-markdown-editor/src/components/Editor/TiptapEditor.tsx) [MODIFY]
- Integrate the `ConfirmDialog` and manage its visibility based on `tabToClose` state if needed, or place it in a higher-level component like `App.tsx` or `EditorArea.tsx`.

### [Component] [TitleBar.tsx](file:///Users/imoling/projects/iml-markdown-editor/src/components/TitleBar/TitleBar.tsx) [MODIFY]
- Intercept the `closeTab` call to check if the tab `isDirty`. If so, set `tabToClose` instead of closing immediately.

## Verification Plan
### Manual Verification
1. Create a new file, type some content, and click 'X' to close. Verify dialog appears.
2. Modify an existing file and click 'X' to close. Verify dialog appears.
3. Test 'Save' option in dialog.
4. Test 'Don't Save' option in dialog.
5. Test 'Cancel' option in dialog.
