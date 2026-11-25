import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HOST_API_VERSION,
  isValidHostApiRange,
  parseHostVersion,
  satisfiesHostApiRange,
} from "../index.js";

test("host version is parsed strictly", () => {
  assert.deepEqual(parseHostVersion("0.1.0"), { major: 0, minor: 1, patch: 0 });
  assert.deepEqual(parseHostVersion("1.2.3-beta.1"), { major: 1, minor: 2, patch: 3 });
  assert.equal(parseHostVersion("0.1"), undefined);
});

test("caret and wildcard ranges match the 0.1 host", () => {
  assert.equal(HOST_API_VERSION, "0.1.0");
  assert.equal(satisfiesHostApiRange("^0.1"), true);
  assert.equal(satisfiesHostApiRange("^0.1.0"), true);
  assert.equal(satisfiesHostApiRange("0.1.x"), true);
  assert.equal(satisfiesHostApiRange("0.x"), true);
  assert.equal(satisfiesHostApiRange("*"), true);
  assert.equal(satisfiesHostApiRange("0.1.0"), true);
});

test("incompatible and malformed ranges do not match", () => {
  assert.equal(satisfiesHostApiRange("^0.2"), false);
  assert.equal(satisfiesHostApiRange("^1.0"), false);
  assert.equal(satisfiesHostApiRange("0.1.1"), false);
  assert.equal(satisfiesHostApiRange("not-a-range"), false);
  assert.equal(isValidHostApiRange("^0.1"), true);
  assert.equal(isValidHostApiRange("~0.1"), false);
});

test("major caret ranges honour the minimum version", () => {
  assert.equal(satisfiesHostApiRange("^1.2.0", "1.3.0"), true);
  assert.equal(satisfiesHostApiRange("^1.2.0", "1.1.9"), false);
  assert.equal(satisfiesHostApiRange("^1.2.0", "2.0.0"), false);
});
