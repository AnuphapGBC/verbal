import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeProfilePhoto, MAX_PROFILE_PHOTO_BYTES } from '../server/photo-validation.js';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/b9kAAAAASUVORK5CYII=';
test('profile photos accept bounded PNG bytes and reject unsupported or misleading input', () => {
  assert.equal(decodeProfilePhoto(`data:image/png;base64,${png}`).mime, 'image/png');
  for (const input of [undefined, 'https://example.com/a.png', 'data:image/svg+xml;base64,PHN2Zy8+', `data:image/jpeg;base64,${png}`, 'data:image/png;base64,***', 'data:image/jpeg;base64,/9j/2Q==']) {
    assert.throws(() => decodeProfilePhoto(input), error => error.status === 422);
  }
});
test('profile photos reject oversized data and excessive pixel dimensions', () => {
  assert.throws(() => decodeProfilePhoto(`data:image/png;base64,${Buffer.alloc(MAX_PROFILE_PHOTO_BYTES + 1).toString('base64')}`), error => error.status === 413);
  const huge = Buffer.from(png, 'base64'); huge.writeUInt32BE(50000, 16);
  assert.throws(() => decodeProfilePhoto(`data:image/png;base64,${huge.toString('base64')}`), error => error.status === 422);
});
