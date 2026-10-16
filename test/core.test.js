import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createCorrelationIdMiddleware, isUuid, uuid } from '../src/core.js';

/**
 * Minimal fake request. Real http.IncomingMessage has a lowercased
 * `headers` object; we replicate just that contract.
 */
function makeReq(headers = {}) {
  const lower = {};
  for (const [k, v] of Object.entries(headers)) {
    lower[k.toLowerCase()] = v;
  }
  return { headers: lower };
}

/**
 * Minimal fake response capturing setHeader calls.
 */
function makeRes() {
  const headers = {};
  return {
    headers,
    setHeader(name, value) {
      headers[name] = value;
    },
  };
}

test('uuid returns a 36-character string with the v4 shape', () => {
  const id = uuid();
  assert.equal(typeof id, 'string');
  assert.equal(id.length, 36);
  assert.equal(id[14], '4'); // version 4
  assert.ok('89ab'.includes(id[19].toLowerCase())); // variant
});

test('isUuid accepts a lowercase v4 UUID', () => {
  assert.equal(isUuid('550e8400-e29b-41d4-a716-446655440000'), true);
});

test('isUuid accepts an uppercase UUID (case-insensitive)', () => {
  assert.equal(isUuid('550E8400-E29B-41D4-A716-446655440000'), true);
});

test('isUuid rejects the nil UUID', () => {
  assert.equal(isUuid('00000000-0000-0000-0000-000000000000'), false);
});

test('isUuid rejects a non-string', () => {
  assert.equal(isUuid(undefined), false);
  assert.equal(isUuid(42), false);
  assert.equal(isUuid(null), false);
});

test('isUuid rejects an empty string', () => {
  assert.equal(isUuid(''), false);
});

test('isUuid rejects a string with the wrong length', () => {
  assert.equal(isUuid('550e8400-e29b-41d4-a716-44665544000'), false);
  assert.equal(isUuid('550e8400-e29b-41d4-a716-4466554400000'), false);
});

test('isUuid rejects a UUID with a bad version nibble', () => {
  assert.equal(isUuid('550e8400-e29b-61d4-a716-446655440000'), false);
});

test('isUuid rejects a UUID with a bad variant nibble', () => {
  // variant nibble 'c' is not in 8/9/a/b
  assert.equal(isUuid('550e8400-e29b-41d4-c716-446655440000'), false);
});

test('isUuid rejects a string with non-hex characters', () => {
  assert.equal(isUuid('550e8400-e29b-41d4-a716-44665544gggg'), false);
});

test('middleware attaches a new UUID when no header is present', () => {
  const mw = createCorrelationIdMiddleware();
  const req = makeReq();
  const res = makeRes();
  let called = false;
  mw(req, res, () => { called = true; });

  assert.equal(called, true);
  assert.equal(typeof req.correlationId, 'string');
  assert.equal(isUuid(req.correlationId), true);
  assert.equal(res.headers['x-correlation-id'], req.correlationId);
});

test('middleware reuses a valid incoming correlation id', () => {
  const mw = createCorrelationIdMiddleware();
  const incoming = '11111111-2222-4333-8444-555555555555';
  const req = makeReq({ 'x-correlation-id': incoming });
  const res = makeRes();
  mw(req, res, () => {});

  assert.equal(req.correlationId, incoming);
  assert.equal(res.headers['x-correlation-id'], incoming);
});

test('middleware generates a new UUID when the incoming header is garbage', () => {
  const mw = createCorrelationIdMiddleware();
  const req = makeReq({ 'x-correlation-id': 'not-a-uuid' });
  const res = makeRes();
  mw(req, res, () => {});

  assert.notEqual(req.correlationId, 'not-a-uuid');
  assert.equal(isUuid(req.correlationId), true);
});

test('middleware honours a custom header name', () => {
  const mw = createCorrelationIdMiddleware({ headerName: 'X-Request-Id' });
  const incoming = '22222222-3333-4444-8555-666666666666';
  const req = makeReq({ 'x-request-id': incoming });
  const res = makeRes();
  mw(req, res, () => {});

  assert.equal(req.correlationId, incoming);
  assert.equal(res.headers['X-Request-Id'], incoming);
});

test('middleware honours a custom property name', () => {
  const mw = createCorrelationIdMiddleware({ propertyName: 'traceId' });
  const req = makeReq();
  const res = makeRes();
  mw(req, res, () => {});

  assert.equal(typeof req.traceId, 'string');
  assert.equal(isUuid(req.traceId), true);
  // The default property is not set.
  assert.equal(req.correlationId, undefined);
});

test('middleware uses the supplied generate function', () => {
  const fixed = '33333333-4444-4555-8666-777777777777';
  const mw = createCorrelationIdMiddleware({ generate: () => fixed });
  const req = makeReq();
  const res = makeRes();
  mw(req, res, () => {});

  assert.equal(req.correlationId, fixed);
});

test('middleware throws on an empty headerName', () => {
  assert.throws(() => createCorrelationIdMiddleware({ headerName: '' }), /headerName/);
});

test('middleware throws on an empty propertyName', () => {
  assert.throws(() => createCorrelationIdMiddleware({ propertyName: '' }), /propertyName/);
});

test('middleware throws when generate is not a function', () => {
  assert.throws(() => createCorrelationIdMiddleware({ generate: 'nope' }), /generate/);
});

test('correlationId property is non-enumerable on the request', () => {
  const mw = createCorrelationIdMiddleware();
  const req = makeReq();
  const res = makeRes();
  mw(req, res, () => {});

  assert.equal(Object.keys(req).includes('correlationId'), false);
  // But the value is still readable.
  assert.equal(typeof req.correlationId, 'string');
});

test('middleware handles a request whose headers object is missing', () => {
  const mw = createCorrelationIdMiddleware();
  const req = {};
  const res = makeRes();
  mw(req, res, () => {});

  assert.equal(typeof req.correlationId, 'string');
  assert.equal(isUuid(req.correlationId), true);
});
