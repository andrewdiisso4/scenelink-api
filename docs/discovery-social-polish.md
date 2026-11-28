# Discovery and social polish acceptance

This is a separate draft based on the signup/newsletter candidate, not a production deployment.

- The same search control is available on the main app pages. Results are grouped by real API result type; the request identity and stale-request protection remain in place. Search still opens Explore and cannot submit a Concierge request. Ask Concierge opens an editable draft.
- The floating spark icon is present before the planner code loads. It opens the same planner on every main app route. No planner is added to email verification or other account-action links. Mobile uses a wide dialog and the launcher clears the tab bar.
- Feed, Inbox, Friends and My profile are linked. Starting a conversation from a profile requires a deliberate action and still uses the existing permission check. The mobile thread retains the in-progress draft when going back to the inbox.
- Real-model usage, paid or third-party calls, venue import, message delivery to real accounts and production are outside this change. Run browser checks using loopback fictional fixtures. Physical iPhone acceptance remains separate.
