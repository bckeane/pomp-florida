import { logRequest } from '../models/requestLog.js';

// Static assets (hashed JS/CSS/image/font files under client/dist) are
// identified by a file extension in the path and skipped, so the log stays
// a record of pages and API calls rather than every bundled chunk.
const STATIC_ASSET_RE = /\.[a-zA-Z0-9]+$/;

export function requestLogger(req, res, next) {
  if (STATIC_ASSET_RE.test(req.path)) return next();

  const start = Date.now();
  // req.account is set (when present) by requireAccount/requireAdmin further
  // down the chain — reading it on 'finish' rather than now means it's
  // already populated by the time this fires.
  res.on('finish', () => {
    logRequest({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
      accountId: req.account?.id,
    });
  });
  next();
}
