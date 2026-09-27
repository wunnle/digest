import test from "node:test";
import assert from "node:assert/strict";

import { validateAttachments } from "../scripts/validate-attachments.mjs";

const at = "/runs/fixture.json: https://x.com/simonw/status/2104002636513206422";
const itemUrl = "https://x.com/simonw/status/2104002636513206422";

test("accepts a poster-backed native X video without a direct playback URL", () => {
  assert.deepEqual(
    validateAttachments(
      [
        {
          type: "native_video",
          poster_url: "https://pbs.twimg.com/amplify_video_thumb/2104002605764718592/img/noO-mt0Fhs-rEggi?format=webp&name=medium",
          external_url: itemUrl,
          width: 1280,
          height: 720,
          duration: 15,
        },
      ],
      at,
      itemUrl,
    ),
    [],
  );
});

test("accepts a resolved YouTube link card", () => {
  assert.deepEqual(
    validateAttachments(
      [
        {
          type: "link_card",
          url: "https://www.youtube.com/watch?v=yB6_iFGTq9k",
          title: "Can Rewriting an AI Agent Bend the Intelligence Curve?",
          publisher: "YouTube",
        },
      ],
      at,
      itemUrl,
    ),
    [],
  );
});

test("rejects blob and non-HTTPS attachment URLs", () => {
  const errors = validateAttachments(
    [
      {
        type: "native_video",
        poster_url: "https://pbs.twimg.com/frame.jpg",
        external_url: "blob:https://x.com/temporary",
        width: 1280,
        height: 720,
      },
      {
        type: "link_card",
        url: "javascript:alert(1)",
        title: "Bad card",
      },
    ],
    at,
    itemUrl,
  );

  assert.equal(errors.length, 2);
  assert.match(errors[0], /external_url must be https/);
  assert.match(errors[1], /url must be https/);
});

test("rejects malformed attachments", () => {
  const errors = validateAttachments(
    [
      { type: "native_video", poster_url: "https://pbs.twimg.com/frame.jpg", external_url: itemUrl, width: 0, height: 720 },
      { type: "link_card", url: "https://example.com", title: "" },
      { type: "mystery" },
    ],
    at,
    itemUrl,
  );

  assert.equal(errors.length, 3);
  assert.match(errors[0], /positive numeric width and height/);
  assert.match(errors[1], /title must be a non-empty string/);
  assert.match(errors[2], /unknown attachment type/);
});

test("requires a native video to open its containing X post", () => {
  const errors = validateAttachments(
    [
      {
        type: "native_video",
        poster_url: "https://pbs.twimg.com/frame.jpg",
        external_url: "https://example.com/unrelated",
        width: 1280,
        height: 720,
      },
    ],
    at,
    itemUrl,
  );

  assert.equal(errors.length, 1);
  assert.match(errors[0], /external_url must match the item URL/);
});

test("rejects numeric strings for native video measurements", () => {
  const errors = validateAttachments(
    [
      {
        type: "native_video",
        poster_url: "https://pbs.twimg.com/frame.jpg",
        external_url: itemUrl,
        width: "1280",
        height: "720",
        duration: "15",
      },
    ],
    at,
    itemUrl,
  );

  assert.equal(errors.length, 2);
  assert.match(errors[0], /positive numeric width and height/);
  assert.match(errors[1], /duration must be a positive number/);
});

test("rejects a non-string link-card publisher", () => {
  const errors = validateAttachments(
    [
      {
        type: "link_card",
        url: "https://www.youtube.com/watch?v=yB6_iFGTq9k",
        title: "A valid title",
        publisher: { bad: true },
      },
    ],
    at,
    itemUrl,
  );

  assert.equal(errors.length, 1);
  assert.match(errors[0], /publisher must be a non-empty string/);
});
