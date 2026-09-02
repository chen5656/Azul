/**
 * Avatar upload and serve.
 *
 * The interesting property is not that a PNG round-trips — it is that the
 * endpoint refuses everything else, and that a replaced avatar leaves nothing
 * behind in the bucket.
 */

import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { apiRequest, call, migrate, signUp } from './helpers';

/** The smallest valid PNG: a 1x1 transparent pixel. */
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (character) => character.charCodeAt(0),
);

beforeEach(async () => {
  await migrate();
});

function put(body: BodyInit, contentType: string, session?: Awaited<ReturnType<typeof signUp>>) {
  return call(
    apiRequest('/api/me/avatar', {
      method: 'PUT',
      session,
      body,
      headers: { 'content-type': contentType },
    }),
  );
}

describe('PUT /api/me/avatar', () => {
  it('needs a session', async () => {
    expect((await put(PNG, 'image/png')).status).toBe(401);
  });

  it('stores the image and points the user row at it', async () => {
    const session = await signUp();
    const response = await put(PNG, 'image/png', session);
    expect(response.status).toBe(200);

    const { image_url: url } = await response.json<{ image_url: string }>();
    expect(url).toMatch(new RegExp(`^/api/avatar/${session.userId}/[0-9a-f-]+\\.png$`));

    const row = await env.DB.prepare('SELECT image FROM "user" WHERE id = ?')
      .bind(session.userId)
      .first<{ image: string }>();
    expect(row?.image).toBe(url);
  });

  it('serves the stored image back', async () => {
    const session = await signUp();
    const { image_url: url } = await (await put(PNG, 'image/png', session)).json<{
      image_url: string;
    }>();

    const response = await call(apiRequest(url));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
  });

  it('refuses a type a browser would not render as an image', async () => {
    const session = await signUp();
    const response = await put('<svg/>', 'image/svg+xml', session);
    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({ error: { code: 'UNSUPPORTED_MEDIA' } });
  });

  it('refuses an image over the size cap', async () => {
    const session = await signUp();
    const response = await put(new Uint8Array(1_048_577), 'image/png', session);
    expect(response.status).toBe(413);
  });

  it('leaves only the newest image in the bucket', async () => {
    const session = await signUp();
    await put(PNG, 'image/png', session);
    const second = await (await put(PNG, 'image/webp', session)).json<{ image_url: string }>();

    const listing = await env.AVATARS.list({ prefix: `${session.userId}/` });
    expect(listing.objects.map((object) => `/api/avatar/${object.key}`)).toEqual([
      second.image_url,
    ]);
  });

  it('404s a key that is not an avatar path', async () => {
    expect((await call(apiRequest('/api/avatar/../../etc/passwd'))).status).toBe(404);
  });
});

describe('DELETE /api/me', () => {
  it('takes the uploaded avatars with it', async () => {
    const session = await signUp();
    await put(PNG, 'image/png', session);

    await call(apiRequest('/api/me', { method: 'DELETE', session }));

    const listing = await env.AVATARS.list({ prefix: `${session.userId}/` });
    expect(listing.objects).toHaveLength(0);
  });
});
