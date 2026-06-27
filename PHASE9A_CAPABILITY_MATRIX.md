# Phase 9A — Backend Social Capability Matrix

Verified via production smoke test (18/18 core flows PASS) on 2026-06-27.

| Feature | Endpoint | Table | Working? | Gap | Action |
|---|---|---|---|---|---|
| Profile (me) | GET /api/users/me | users | ✅ | — | none |
| Profile (public) | GET /api/users/:id | users | ✅ | — | none |
| Update profile | PUT /api/auth/profile | users | ✅ | — | none |
| User search | GET /api/users/search?q= | users | ✅ | — | none |
| Suggestions | — | — | ❌ | no /users/suggestions | ADD |
| Friend request | POST /api/friends/request {user_id} | friendships | ✅ | — | none |
| Pending requests | GET /api/friends/pending | friendships | ✅ | — | none |
| Accept | POST /api/friends/accept {friendship_id} | friendships | ✅ | — | none |
| Decline | POST /api/friends/decline {friendship_id} | friendships | ✅ | — | none |
| Remove friend | DELETE /api/friends/:friendUserId | friendships | ✅ | — | none |
| Block | POST /api/users/:id/block | user_blocks | ✅ | — | none |
| Unblock | DELETE /api/users/:id/block | user_blocks | ✅ | — | none |
| Report | POST /api/reports | user_reports | ✅ | — | none |
| Feed | GET /api/posts/feed?limit= | posts+checkins+reviews | ✅ | no cursor pagination | ENHANCE (add ?cursor) |
| Create post | POST /api/posts {body,venue_id,image_url} | posts | ✅ | — | none |
| Delete post | DELETE /api/posts/:id | posts | ✅ | — | none |
| Like (toggle) | POST /api/posts/:id/like | post_likes | ✅ | — | none |
| Comments list | GET /api/posts/:id/comments | post_comments | ✅ | — | none |
| Add comment | POST /api/posts/:id/comments {body} | post_comments | ✅ | — | none |
| Delete comment | DELETE /api/posts/:id/comments/:commentId | post_comments | ✅ | — | none |
| Check-in | POST /api/checkins {venue_id} | checkins | ✅ | — | none |
| Delete check-in | DELETE /api/checkins/:id | checkins | ✅ | — | none |
| Venue activity | GET /api/venues/:id/activity | — | ⚠️ verify | maybe missing | VERIFY/ADD |
| Conversations list | GET /api/conversations | conversations | ✅ | — | none |
| Create conversation | POST /api/conversations {user_id} | conversations | ✅ | — | none |
| Get messages | GET /api/conversations/:id/messages | messages | ✅ | — | none |
| Send message | POST /api/conversations/:id/messages {body} | messages | ✅ | — | none |
| Mark read | POST /api/conversations/:id/read | conversation_participants | ✅ | — | none |
| Unread count | GET /api/conversations/unread-count | messages | ✅ | — | none |
| Notifications | GET /api/notifications | notifications | ✅ | — | none |
| Unread notif count | GET /api/notifications/unread-count | notifications | ✅ | — | none |
| Mark notif read | POST /api/notifications/:id/read | notifications | ✅ | — | none |
| Mark all read | POST /api/notifications/read-all | notifications | ✅ | — | none |
| Social summary | GET /api/social/summary | (aggregate) | ✅ | — | none |
| Share plan | POST /api/plans/:id/share | posts | ✅ | — | none |
| Share venue | — | — | ❌ | use POST /posts {venue_id} | OK via posts |
| Share list | — | — | ⚠️ | list privacy share | VERIFY |
| Plan invites | POST /api/plans/:id/invites | plan_invites | ✅ | — | none |
| Accept plan invite | POST /api/plans/:id/invites/:inviteId/accept | plan_invites | ✅ | — | none |
| Auth guard (401) | all social | — | ✅ | — | none |
| Media upload | — | — | ❌ | no object storage configured | NEEDS CREDS |
| Realtime | — | — | ❌ | none | ADD SSE/polling |

## Summary
- **Backend is ~90% complete and production-functional.**
- Core social loop (friends/posts/likes/comments/messages/notifications) fully works and persists.
- Gaps: suggestions endpoint, cursor pagination on feed, venue activity endpoint (verify), realtime layer, media upload (needs owner-provided storage creds).
- **The bulk of Phase 9A work is the FRONTEND social client + UI**, which currently does not exist as a unified layer.

## Decision on media (STEP 5)
Media storage credentials are NOT present in the backend env. Per hard rules, media posting will be built with a graceful capability flag: if MEDIA storage env (Cloudinary/S3/R2) is configured, avatar+post image upload activates; otherwise the UI hides image-attach and shows text+venue posts only. This is explicitly reported, NOT hidden. Owner must provide storage creds via Render secret store to enable photos.
