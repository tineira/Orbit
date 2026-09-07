import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveParentEmbedderOrigin } from "./preview-embedder-origin.ts";

describe("resolveParentEmbedderOrigin", () => {
  it("noops when the page is not framed", () => {
    assert.equal(
      resolveParentEmbedderOrigin(true, "https://grok.com/", null, "abc.grok-sandbox.com"),
      null,
    );
  });

  it("allows grok.com parents of a sandbox guest", () => {
    assert.equal(
      resolveParentEmbedderOrigin(false, "https://grok.com/chat", null, "abc.grok-sandbox.com"),
      "https://grok.com",
    );
  });

  it("rejects a third-party parent of a sandbox guest", () => {
    assert.equal(
      resolveParentEmbedderOrigin(
        false,
        "https://evil.example/embed",
        "https://evil.example",
        "abc.grok-sandbox.com",
      ),
      null,
    );
  });

  it("allows remint preview pairs", () => {
    assert.equal(
      resolveParentEmbedderOrigin(
        false,
        "https://app.example.com/",
        null,
        "label.preview.app.example.com",
      ),
      "https://app.example.com",
    );
    assert.equal(
      resolveParentEmbedderOrigin(
        false,
        "https://grok.app.example.com/",
        null,
        "label.preview.app.example.com",
      ),
      "https://grok.app.example.com",
    );
  });
});
