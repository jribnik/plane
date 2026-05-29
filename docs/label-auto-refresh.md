# Label Auto-Refresh Feature

## Overview

This feature enables multi-select dropdown options (specifically labels) to automatically update without requiring a page reload. This is particularly useful when webhook automations modify label options, allowing users to see the changes immediately.

## How It Works

### 1. Store-Level Support

The `LabelStore` (`apps/web/core/store/label.store.ts`) includes a method for refreshing project labels:

- **`refreshProjectLabels(workspaceSlug, projectId)`** - Refetches project labels and reconciles them into the store: newly added labels are merged in, and labels that no longer exist server-side (e.g. removed by a webhook) are pruned. The reconcile runs in a single MobX action without flipping the `fetchedMap` flag, so consumers never observe an empty label list mid-refresh — important because an open label dropdown unmounts if its label list momentarily becomes empty.

### 2. Auto-Refresh Hook

The `useLabelAutoRefresh` hook (`apps/web/core/hooks/use-label-auto-refresh.ts`) provides automatic periodic refreshing:

```typescript
useLabelAutoRefresh({
  workspaceSlug: "my-workspace",
  projectId: "project-123",
  enabled: true, // Enable/disable auto-refresh
  intervalMs: 30000, // Refresh every 30 seconds
});
```

**Features:**

- Automatically sets up an interval timer when enabled
- Cleans up the interval when disabled or component unmounts
- Skips refreshing while the tab is hidden (`document.hidden`) to avoid background polling
- Handles errors gracefully with console logging
- Can be conditionally enabled (e.g., only when dropdown is open)

### 3. Integration in Label Dropdown

The label dropdown component (`apps/web/core/components/issues/issue-layouts/properties/label-dropdown.tsx`) now includes auto-refresh:

- Auto-refresh is **enabled only when the dropdown is open**
- Refreshes every **30 seconds** by default
- Minimal performance impact since it only runs when needed

## Usage

### For Users

1. Open a label dropdown on any issue
2. Keep the dropdown open
3. If your webhook automation adds/modifies labels, they will appear within 30 seconds
4. No page reload required!

### For Developers

#### Manual Refresh

If you need to manually trigger a label refresh (e.g., after a webhook callback):

```typescript
import { useLabel } from "@/hooks/store/use-label";

const { refreshProjectLabels } = useLabel();

// Trigger manual refresh
await refreshProjectLabels(workspaceSlug, projectId);
```

#### Custom Auto-Refresh Interval

To use a different refresh interval, modify the `intervalMs` parameter:

```typescript
useLabelAutoRefresh({
  workspaceSlug,
  projectId,
  enabled: isOpen,
  intervalMs: 15000, // Refresh every 15 seconds
});
```

#### Disable Auto-Refresh

To disable auto-refresh in specific contexts:

```typescript
useLabelAutoRefresh({
  workspaceSlug,
  projectId,
  enabled: false, // Disabled
});
```

## Performance Considerations

- Auto-refresh is **only active when the dropdown is open**, minimizing unnecessary API calls
- The default 30-second interval balances responsiveness with server load
- Failed refreshes are logged but don't interrupt the user experience
- The interval automatically cleans up when the component unmounts

## Future Enhancements

Potential improvements:

- WebSocket support for real-time updates (eliminates polling)
- Configurable refresh intervals per workspace/project
- Visual indicator when new labels are detected
- Smarter refresh logic based on webhook events
- Support for other multi-select fields (custom fields, etc.)

## Files Modified

1. `apps/web/core/store/label.store.ts` - Added `refreshProjectLabels` (merge + prune reconcile)
2. `apps/web/core/hooks/use-label-auto-refresh.ts` - New hook for auto-refresh functionality
3. `apps/web/core/components/issues/issue-layouts/properties/label-dropdown.tsx` - Integrated auto-refresh hook
