/**
 * SceneLink Backend — Sentry initialization
 *
 * Initialized as early as possible before any routes/middleware.
 * Reads configuration from environment variables only.
 * Fails safe: if SENTRY_DSN is missing or the SDK fails to init, the app
 * still starts normally and exports no-op middleware.
 *
 * PRIVACY:
 *  - Strips Authorization, Cookie, X-Admin-Secret headers.
 *  - Strips request bodies that look like auth payloads.
 *  - Never forwards database credentials, JWTs, OAuth tokens, or message content.
 */

let Sentry = null;
let initialized = false;

function tryInit() {
  if (initialized) return;
  initialized = true;

  const DSN = process.env.SENTRY_DSN || '';
  if (!DSN) {
    console.info('[sentry] SENTRY_DSN not set — Sentry disabled.');
    return;
  }

  try {
    Sentry = require('@sentry/node');
  } catch (e) {
    console.warn('[sentry] @sentry/node not installed — Sentry disabled.');
    Sentry = null;
    return;
  }

  const ENV = process.env.SENTRY_ENV || process.env.NODE_ENV || 'production';
  const TRACES = parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1');
  const RELEASE = process.env.RENDER_GIT_COMMIT || process.env.SENTRY_RELEASE || 'scenelink-api@dev';

  try {
    Sentry.init({
      dsn: DSN,
      environment: ENV,
      release: RELEASE,
      tracesSampleRate: isFinite(TRACES) ? TRACES : 0.1,
      // Scrub sensitive request data before it leaves the server
      beforeSend(event) {
        try {
          if (event.request) {
            // Scrub headers
            if (event.request.headers) {
              ['authorization', 'Authorization', 'cookie', 'Cookie', 'x-admin-secret', 'X-Admin-Secret', 'x-api-key'].forEach((k) => {
                if (event.request.headers[k]) event.request.headers[k] = '[scrubbed]';
              });
            }
            // Scrub body
            if (event.request.data) {
              if (typeof event.request.data === 'string' && /password|token|secret|authorization/i.test(event.request.data)) {
                event.request.data = '[scrubbed]';
              } else if (typeof event.request.data === 'object') {
                const d = event.request.data;
                ['password', 'newPassword', 'currentPassword', 'token', 'id_token', 'refresh_token', 'access_token', 'secret', 'api_key', 'jwt'].forEach((k) => {
                  if (k in d) d[k] = '[scrubbed]';
                });
              }
            }
            // Strip query-string tokens
            if (event.request.query_string && typeof event.request.query_string === 'string') {
              event.request.query_string = event.request.query_string.replace(/((?:token|jwt|access_token|code|secret)=)[^&]+/gi, '$1[scrubbed]');
            }
            if (event.request.url && typeof event.request.url === 'string') {
              event.request.url = event.request.url.replace(/((?:token|jwt|access_token|code|secret)=)[^&]+/gi, '$1[scrubbed]');
            }
          }
          // Never forward user emails — keep only stable id
          if (event.user) {
            delete event.user.email;
            delete event.user.username;
            delete event.user.ip_address;
          }
          // Strip sensitive env vars that might leak through
          if (event.contexts && event.contexts.runtime && event.contexts.runtime.env) {
            delete event.contexts.runtime.env;
          }
        } catch (_) {}
        return event;
      },
      integrations: [
        new Sentry.Integrations.Http({ tracing: true }),
        new Sentry.Integrations.Express({ /* app attached below */ }),
      ],
    });

    console.info(`[sentry] Initialized. env=${ENV} traces=${TRACES}`);
  } catch (e) {
    console.warn('[sentry] init failed:', e && e.message);
    Sentry = null;
  }
}

/**
 * Attach Sentry request + tracing middleware to an Express app.
 * Must be called BEFORE any routes.
 */
function attachRequestHandlers(app) {
  tryInit();
  if (!Sentry) return;
  try {
    app.use(Sentry.Handlers.requestHandler({
      // Minimal request capture — no body, no ip, no user
      request: ['method', 'url', 'headers'],
      ip: false,
    }));
    app.use(Sentry.Handlers.tracingHandler());
  } catch (e) {
    console.warn('[sentry] failed to attach request handlers:', e && e.message);
  }
}

/**
 * Attach Sentry error handler. Must be called AFTER routes, BEFORE
 * the app's own error handler.
 */
function attachErrorHandler(app) {
  if (!Sentry) return;
  try {
    app.use(Sentry.Handlers.errorHandler({
      shouldHandleError(err) {
        // Report 500s and uncaught exceptions; skip 4xx client errors
        const status = err && (err.status || err.statusCode);
        if (!status) return true;
        return status >= 500;
      },
    }));
  } catch (e) {
    console.warn('[sentry] failed to attach error handler:', e && e.message);
  }
}

/** Manually capture a message/exception if Sentry is initialized. No-op otherwise. */
function capture(err, ctx) {
  try {
    if (!Sentry) return;
    if (ctx) {
      Sentry.withScope((scope) => {
        Object.keys(ctx).forEach((k) => scope.setTag(k, String(ctx[k]).slice(0, 120)));
        Sentry.captureException(err);
      });
    } else {
      Sentry.captureException(err);
    }
  } catch (_) {}
}

function isEnabled() { return !!Sentry; }

module.exports = {
  init: tryInit,
  attachRequestHandlers,
  attachErrorHandler,
  capture,
  isEnabled,
};