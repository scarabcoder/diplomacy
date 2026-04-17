<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into this Diplomacy game platform. The following changes were made:

- **`posthog-js`** and **`posthog-node`** packages installed via Bun.
- **Environment variables** (`VITE_PUBLIC_POSTHOG_PROJECT_TOKEN`, `VITE_PUBLIC_POSTHOG_HOST`) written to `.env` and covered by `.gitignore`.
- **`src/utils/posthog-server.ts`** — new singleton PostHog server-side client using `posthog-node`, used for future server-side capture from API routes.
- **`src/routes/__root.tsx`** — `PostHogProvider` wraps the app in the shell document, enabling automatic pageview tracking, session replay, and exception capture across all routes.
- **`vite.config.ts`** — `/ingest` reverse proxy added so PostHog requests are routed through the dev server, avoiding CORS issues.
- **`src/routes/_auth/login.tsx`** — `posthog.identify()` on successful email sign-in and guest sign-in; `user_signed_in` and `guest_signed_in` events captured; errors sent to `posthog.captureException()`.
- **`src/routes/_auth/register.tsx`** — `posthog.identify()` on successful registration; `user_signed_up` event captured; errors sent to `posthog.captureException()`.
- **`src/routes/_authenticated/index.tsx`** — `room_created`, `room_joined`, and `user_signed_out` events captured in their respective handlers; `posthog.reset()` called on logout.
- **`src/routes/_authenticated/rooms/$roomId/index.tsx`** — `power_selected`, `player_marked_ready`, and `game_started` events captured in lobby action handlers.
- **`src/domain/game/components/game-order-workspace/use-game-order-workspace.tsx`** — `orders_submitted` event captured after any successful phase submission (orders, retreats, or builds), including `phase`, `power`, `room_id`, `year`, and `season` properties.

## Events

| Event | Description | File |
|---|---|---|
| `user_signed_up` | User creates a new account with email and password | `src/routes/_auth/register.tsx` |
| `user_signed_in` | User signs in with email and password | `src/routes/_auth/login.tsx` |
| `guest_signed_in` | User signs in as a guest with a display name only | `src/routes/_auth/login.tsx` |
| `user_signed_out` | User clicks the sign out button on the home page | `src/routes/_authenticated/index.tsx` |
| `room_created` | User creates a new game room | `src/routes/_authenticated/index.tsx` |
| `room_joined` | User joins an existing room by entering its code | `src/routes/_authenticated/index.tsx` |
| `power_selected` | Player selects a power (country) in the lobby | `src/routes/_authenticated/rooms/$roomId/index.tsx` |
| `player_marked_ready` | Player marks themselves ready to start in the lobby | `src/routes/_authenticated/rooms/$roomId/index.tsx` |
| `game_started` | Room creator starts the game once all seats are ready | `src/routes/_authenticated/rooms/$roomId/index.tsx` |
| `orders_submitted` | Player submits orders for the current phase | `src/domain/game/components/game-order-workspace/use-game-order-workspace.tsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://us.posthog.com/project/386807/dashboard/1481593
- **Sign-up to game started funnel**: https://us.posthog.com/project/386807/insights/xCqs2xKN
- **Daily sign-ins (email + guest)**: https://us.posthog.com/project/386807/insights/vGM5FtI3
- **Room creation and join activity**: https://us.posthog.com/project/386807/insights/s3zhEalu
- **Orders submitted by phase**: https://us.posthog.com/project/386807/insights/q6dPhToI
- **Lobby drop-off: ready vs game started**: https://us.posthog.com/project/386807/insights/BKbb7FiA

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
