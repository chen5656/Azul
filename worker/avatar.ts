/**
 * Player avatars.
 *
 * Uploads land in R2 and are served back through this Worker rather than a
 * public bucket URL: one origin means the CSP stays `img-src 'self'`, and a
 * removed image stops being reachable the moment the row changes.
 */

import { HttpError, json } from './http';
import type { Session } from './auth';

/** What a browser can actually render, and what we are willing to store. */
const TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Generous for a 256px avatar, small enough that a stray upload cannot fill the bucket. */
const MAX_BYTES = 1_048_576;

const KEY = /^[0-9a-zA-Z]+\/[0-9a-zA-Z-]+\.(png|jpg|webp|gif)$/;

/**
 * `PUT /api/me/avatar` — the raw image as the body, its `content-type` naming
 * the format. Multipart buys nothing here: there is exactly one field.
 */
export async function uploadAvatar(
  env: Env,
  session: Session,
  request: Request,
  setImage: (url: string) => Promise<void>,
): Promise<Response> {
  const contentType = (request.headers.get('content-type') ?? '').split(';')[0].trim();
  const extension = TYPES[contentType];
  if (!extension) {
    throw new HttpError(
      415,
      'UNSUPPORTED_MEDIA',
      'An avatar must be a PNG, JPEG, WebP or GIF image',
    );
  }

  const body = await request.arrayBuffer();
  if (body.byteLength === 0) throw new HttpError(422, 'INVALID_PAYLOAD', 'The image is empty');
  if (body.byteLength > MAX_BYTES) {
    throw new HttpError(413, 'TOO_LARGE', 'An avatar must be under 1 MB');
  }

  // A fresh key per upload, so a replaced avatar is never served from a cache
  // keyed on the old URL.
  const key = `${session.userId}/${crypto.randomUUID()}.${extension}`;
  await env.AVATARS.put(key, body, {
    httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' },
  });

  const url = `/api/avatar/${key}`;
  await setImage(url);

  // Best effort: the new row is already live, so a failure to sweep the old
  // object costs storage, not correctness.
  await deleteOthers(env, session.userId, key).catch(() => {});

  return json({ image_url: url });
}

async function deleteOthers(env: Env, userId: string, keep: string): Promise<void> {
  const listing = await env.AVATARS.list({ prefix: `${userId}/` });
  const stale = listing.objects.map((object) => object.key).filter((key) => key !== keep);
  if (stale.length) await env.AVATARS.delete(stale);
}

/** `GET /api/avatar/<userId>/<uuid>.<ext>` */
export async function serveAvatar(env: Env, key: string): Promise<Response> {
  if (!KEY.test(key)) throw new HttpError(404, 'NOT_FOUND', 'No such avatar');

  const object = await env.AVATARS.get(key);
  if (!object) throw new HttpError(404, 'NOT_FOUND', 'No such avatar');

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  return new Response(object.body, { headers });
}

/** Drops every avatar a player uploaded; part of account deletion. */
export async function deleteAvatars(env: Env, userId: string): Promise<void> {
  const listing = await env.AVATARS.list({ prefix: `${userId}/` });
  if (listing.objects.length) {
    await env.AVATARS.delete(listing.objects.map((object) => object.key));
  }
}
