import assert from "node:assert/strict";
import { test } from "node:test";
import { installDesktopWebviewGuards, isBrowserAccelerator, type AcceleratorInput } from "./desktop-guards";

function key(key: string, patch: Partial<AcceleratorInput> = {}): AcceleratorInput {
  return { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...patch };
}

test("desktop runtime suppresses the native context menu", () => {
  const target = new EventTarget();
  const restore = installDesktopWebviewGuards(target, true);
  const event = new Event("contextmenu", { cancelable: true });

  assert.equal(target.dispatchEvent(event), false);

  restore();
  assert.equal(target.dispatchEvent(new Event("contextmenu", { cancelable: true })), true);
});

test("browser runtime keeps the normal context menu", () => {
  const target = new EventTarget();
  const restore = installDesktopWebviewGuards(target, false);

  assert.equal(target.dispatchEvent(new Event("contextmenu", { cancelable: true })), true);

  restore();
});

test("reload, find, print, zoom and devtools shortcuts are browser accelerators", () => {
  assert.equal(isBrowserAccelerator(key("F5")), true);
  assert.equal(isBrowserAccelerator(key("F12")), true);
  assert.equal(isBrowserAccelerator(key("r", { ctrlKey: true })), true);
  assert.equal(isBrowserAccelerator(key("R", { metaKey: true, shiftKey: true })), true);
  assert.equal(isBrowserAccelerator(key("f", { ctrlKey: true })), true);
  assert.equal(isBrowserAccelerator(key("p", { ctrlKey: true })), true);
  assert.equal(isBrowserAccelerator(key("=", { ctrlKey: true })), true);
  assert.equal(isBrowserAccelerator(key("i", { ctrlKey: true, shiftKey: true })), true);
});

test("editing shortcuts remain available in the desktop runtime", () => {
  assert.equal(isBrowserAccelerator(key("c", { ctrlKey: true })), false);
  assert.equal(isBrowserAccelerator(key("v", { ctrlKey: true })), false);
  assert.equal(isBrowserAccelerator(key("z", { ctrlKey: true })), false);
  assert.equal(isBrowserAccelerator(key("s", { ctrlKey: true })), false);
  assert.equal(isBrowserAccelerator(key("Delete")), false);
});
