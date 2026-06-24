# Requirements Document

## Introduction

This spec covers six frontend features in the email-catcher site that have full or partial backend support but no UI implementation. Each feature wires existing API endpoints to new or existing views. A final requirement covers backend changes needed to support the frontend work.

## Glossary

- **Site**: The email-catcher Vue 3 SPA at `email-catcher/site`
- **Account_Store**: The Pinia store (`useAccountStore`) managing the active account state
- **API_Client**: The `api` module in `src/lib/api.ts` returning neverthrow `Result` types
- **Stats_Widget**: A compact clickable summary at the top of the inbox showing a donut + totals + stacked area chart
- **Stats_View**: A dedicated full-screen view showing complete signal processing history (accessed by clicking the widget)
- **Settings_View**: The existing `SettingsView.vue` with tabbed account configuration
- **Domain_Card**: The UI card rendered for each domain in the Settings domains tab
- **Rule_Editor**: The existing `RuleEditorView.vue` for creating and editing rules
- **ConfirmDialog**: The existing reusable confirmation modal component
- **AsyncButton**: The existing button component with loading/success state transitions
- **ECharts**: The chosen chart library (tree-shaken import of pie + line modules)
- **RetentionDuration**: ISO 8601 duration enum (`P1M` through `Infinity`) already defined in the backend

## Requirements

### Requirement 1: Account Stats Dashboard

**User Story:** As a user, I want to see a summary of my signal processing activity, so that I can understand how my email is being categorized.

#### Acceptance Criteria

1. THE Stats_Widget SHALL appear at the top of the inbox view, displaying: a donut chart showing lifetime category proportions (allowed/quarantined/blocked) on the left, lifetime totals as numbers in the center, and a stacked area chart (three colored layers: green=allowed, yellow=quarantined, red=blocked) showing the last 30 days on the right. The chart library SHALL be ECharts (tree-shaken).
2. THE entire Stats_Widget SHALL be clickable, navigating the user to the dedicated Stats_View. A "View full stats →" link SHALL appear below the donut for discoverability.
3. THE Stats_Widget SHALL include a hover/cursor state indicating it is interactive. The donut segments SHALL highlight on hover with a tooltip showing category name, count, and percentage.
4. THE Stats_View SHALL display daily signal counts for the last 365 days and monthly counts before that, as returned by the backend.
5. WHILE stats data is loading, THE Stats_Widget and Stats_View SHALL display a loading skeleton state.
6. IF the stats request fails, THEN THE Stats_View SHALL display an error message with a retry action.
7. THE Stats_Widget SHALL be collapsible via an accordion. The expanded/collapsed state SHALL be persisted in a Pinia store backed by localStorage for session-to-session persistence.
8. THE Stats_View SHALL NOT have a sidebar navigation item — it is only accessible by clicking the Stats_Widget.
9. WHEN the account has zero signals (new account), THE Stats_Widget SHALL still render with zeroed totals and an empty chart.
10. THE stats data SHALL be fetched once on navigation — no auto-refresh.

### Requirement 2: Forwarding Address Verification UI

**User Story:** As a user, I want to verify my forwarding address by clicking the link in the verification email, so that the address becomes active for forwarding.

#### Acceptance Criteria

1. WHEN the Settings forwarding tab loads with query parameters `verifyAddress`, `token`, and `accountId`, THE Settings_View SHALL auto-submit the verification by calling `POST /accounts/:accountId/forwarding-addresses/:address/verify` with the token.
2. WHEN the verification request succeeds, THE Settings_View SHALL display a success toast AND refresh the forwarding address list showing the address as verified.
3. IF the verification request fails, THEN THE Settings_View SHALL display the error reason inline in the forwarding tab.
4. THE verification flow SHALL require authentication — the login flow redirects back to the same URL preserving query params.
5. THE `accountId` query parameter SHALL be processed by the global route guard (not individual components) to set account context via the Account_Store. This is a cross-cutting concern handled at the router level per 018-ARCH §34 and 021-FRONT.

### Requirement 3: Domain Delete

**User Story:** As a user, I want to remove a domain from my account, so that I can clean up domains I no longer use.

#### Acceptance Criteria

1. THE Domain_Card SHALL display a delete button for each domain in the Settings domains tab.
2. WHEN the user clicks the delete button, THE Site SHALL show a ConfirmDialog warning: "This will delete all aliases on this domain. You will no longer receive email for this domain. All DNS configuration will be removed."
3. WHEN the user confirms deletion, THE Site SHALL call `DELETE /accounts/:id/domains/:domainId` via the API_Client.
4. WHEN the deletion succeeds, THE Settings_View SHALL remove the domain from the displayed list without a full reload.
5. IF the deletion request fails, THEN THE Site SHALL display the error via the notification system.

### Requirement 4: Webhook Rule Action UI

**User Story:** As a user, I want to configure webhook actions in my rules, so that I can send signal data to external services.

#### Acceptance Criteria

1. THE Rule_Editor SHALL include `webhook` in the action type dropdown with label "Webhook" and description "POST signal data to an external URL".
2. WHEN the `webhook` action type is selected, THE Rule_Editor SHALL display a URL input field with `type="url"` and placeholder `https://example.com/webhook`.
3. THE Rule_Editor SHALL include a "Test webhook" button that sends a test POST directly from the browser to the configured URL. The payload SHALL be a JSON object with a single randomly-generated key and value `"This test webhook request was generated by {userId}"`.
4. THE Rule_Editor SHALL display the test result inline (success/failure with HTTP status).
5. THE Rule_Editor SHALL store the webhook URL in the action's `value` field, consistent with other action types.
6. WHEN saving a rule with a webhook action, THE Rule_Editor SHALL include the webhook URL in the action payload sent to the backend.

### Requirement 5: Account Settings — Retention Duration

**User Story:** As a user, I want to configure how long my data is retained, so that I can balance storage with my plan's capabilities.

#### Acceptance Criteria

1. THE Settings_View SHALL display a "Data retention" setting in the Email tab (currently named "Compose", rename to "Email").
2. THE Settings_View SHALL render a dropdown selector for `retentionDuration` showing human-readable labels (1 month, 2 months, 3 months, 5 months, 6 months, 1 year, 2 years, 5 years, 10 years, Forever).
3. OPTIONS that exceed the user's current billing plan SHALL be displayed with a visual indicator (e.g. lock icon or "Pro" / "Premium" badge) and SHALL NOT be selectable without upgrading.
4. THE dropdown SHALL read the current billing plan from the Account_Store to determine which options are available.
5. WHEN the user selects a retention value, THE Settings_View SHALL call `PATCH /accounts/:id` with the new `retentionDuration` value via the API_Client.
6. WHEN the update succeeds, THE Account_Store SHALL reflect the updated value.
7. THE Settings_View SHALL display explanatory text: "Applies to all conversations that receive new messages. Existing inactive threads keep their current retention."

### Requirement 6: Post-Send Intent Buttons

**User Story:** As a user, I want to declare my intent at send time, so that the conversation is handled appropriately without a separate action after sending.

#### Acceptance Criteria

1. THE compose area SHALL replace the single "Send" button with two buttons: "Send + Archive" and "Send + Wait".
2. WHEN the user clicks "Send + Archive", THE Site SHALL send the signal AND immediately archive the arc by calling `PATCH /accounts/:id/arcs/:arcId` with `status: "archived"`.
3. WHEN the user clicks "Send + Wait", THE Site SHALL send the signal AND set a followup reminder by calling `PATCH /accounts/:id/arcs/:arcId` with `followupAt` set to 7 days from now (hardcoded PT7D, computed as absolute ISO datetime at call time).
4. THE compose area SHALL visually distinguish the two buttons (e.g. "Send + Archive" as secondary, "Send + Wait" as primary).
5. IF the account-level `afterSendAction` is set to `"archive"`, THEN "Send + Archive" SHALL be highlighted as the default. Otherwise "Send + Wait" SHALL be highlighted.

### Requirement 7: Undo Toast UX Improvements

**User Story:** As a user, I want destructive actions to have a clear, visible undo window with consistent behavior, so that I can recover from mistakes before they're committed.

#### Acceptance Criteria

1. THE undo countdown toast SHALL be rendered at approximately 2× its current size (wider, taller text, larger countdown ring) for improved readability.
2. WHEN the user archives a thread (from the arc detail view), THE Site SHALL immediately navigate back to the arc list (inbox) while showing the undo toast. If the user clicks undo, the arc is restored and remains visible in the list.
3. WHEN the user confirms a delete action (thread delete, domain delete), THE Site SHALL use the same deferred-action toast mechanism (countdown + undo) instead of executing the delete immediately after the ConfirmDialog. The ConfirmDialog confirms intent; the toast provides the grace period.
4. WHEN the user sends an email via "Send + Archive" or "Send + Wait", THE Site SHALL show the same undo countdown toast (with "Cancel send" as the undo label), navigate back to the arc list, and only commit the send after the countdown expires.
5. THE undo toast countdown duration SHALL be consistent across all destructive actions (8 seconds).

### Requirement 8: Always-visible "Available until" on Arc Detail

**User Story:** As a user, I want to always see when a thread will expire, so that I can plan around retention limits and upgrade if needed.

#### Acceptance Criteria

1. WHEN an arc has a `retentionDuration` set, THE arc detail view SHALL always display "Available until {DATE}" (formatted as medium date) regardless of how far away the expiration is.
2. THE existing retention warning (≤30 days, peach/orange banner) SHALL remain unchanged and appear IN ADDITION to the "Available until" text when applicable.
3. BOTH the "Available until" text AND the retention warning banner SHALL be clickable (`cursor: pointer`) and navigate to the Settings Email tab where the retention duration dropdown is displayed.
4. WHEN an arc does NOT have a `retentionDuration` set, THE "Available until" text SHALL NOT be rendered.
