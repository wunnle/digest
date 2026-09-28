import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { validateRenderAudit, validateRunRenderAudits } from "../scripts/validate-render-audit.mjs";

const samples = JSON.parse(readFileSync(new URL("./fixtures/render-audit-samples.json", import.meta.url), "utf8"));

const itemUrl = "https://x.com/example/status/123";
const at = `/runs/fixture.json: ${itemUrl}`;

function item(overrides = {}) {
  return {
    url: itemUrl,
    quote_tweet: null,
    attachments: [],
    render_audit: {
      root_article_url: itemUrl,
      inspected_at: "2026-09-28T08:00:00Z",
      quote_card: { visible: false },
      external_link_card: { visible: false },
      native_video: { visible: false },
    },
    ...overrides,
  };
}

test("requires a render audit for every v3 X item", () => {
  const errors = validateRenderAudit({ url: itemUrl }, at);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /render_audit is required/);
});

test("rejects a visible quote card when quote_tweet is missing", () => {
  const value = item();
  value.render_audit.quote_card = {
    visible: true,
    status_url: "https://x.com/sqs/status/2103512273809735805",
  };
  const errors = validateRenderAudit(value, at);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /visible quote card requires quote_tweet/);
});

test("accepts a visible quote card captured under the same canonical URL", () => {
  const quoteUrl = "https://x.com/sqs/status/2103512273809735805";
  const value = item({
    quote_tweet: { url: quoteUrl },
  });
  value.render_audit.quote_card = { visible: true, status_url: quoteUrl };
  assert.deepEqual(validateRenderAudit(value, at), []);
});

test("rejects a visible external card when its link_card attachment is missing", () => {
  const value = item();
  value.render_audit.external_link_card = {
    visible: true,
    final_url: "https://www.youtube.com/watch?v=yB6_iFGTq9k",
  };
  const errors = validateRenderAudit(value, at);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /visible external link card requires a matching link_card attachment/);
});

test("accepts a visible external card captured under the same final URL", () => {
  const finalUrl = "https://www.youtube.com/watch?v=yB6_iFGTq9k";
  const value = item({
    attachments: [{ type: "link_card", url: finalUrl, title: "A talk" }],
  });
  value.render_audit.external_link_card = { visible: true, final_url: finalUrl };
  assert.deepEqual(validateRenderAudit(value, at), []);
});

test("rejects a visible native video when its attachment is missing", () => {
  const value = item();
  value.render_audit.native_video = { visible: true };
  const errors = validateRenderAudit(value, at);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /visible native video requires a native_video attachment/);
});

test("rejects audit evidence for a different root post", () => {
  const value = item();
  value.render_audit.root_article_url = "https://x.com/other/status/456";
  const errors = validateRenderAudit(value, at);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /root_article_url must match the item URL/);
});

test("accepts the two browser-verified regression samples", () => {
  for (const sample of samples) {
    assert.deepEqual(
      validateRenderAudit(sample.item, `/tests/fixtures/render-audit-samples.json: ${sample.name}`),
      [],
      sample.name,
    );
  }
});

test("rejects captured embeds whose audit says they were not visible", () => {
  const quote = item({ quote_tweet: { url: "https://x.com/sqs/status/123" } });
  assert.match(validateRenderAudit(quote, at)[0], /quote_tweet requires quote_card.visible true/);

  const link = item({ attachments: [{ type: "link_card", url: "https://example.com", title: "Card" }] });
  assert.match(validateRenderAudit(link, at)[0], /link_card attachment requires external_link_card.visible true/);

  const video = item({
    attachments: [{
      type: "native_video",
      poster_url: "https://example.com/frame.jpg",
      external_url: itemUrl,
      width: 1280,
      height: 720,
    }],
  });
  assert.match(validateRenderAudit(video, at)[0], /native_video attachment requires native_video.visible true/);
});

test("requires collection_schema 3 for runs after the migration cutoff", () => {
  const run = {
    generated_at: "2026-09-28T08:00:00Z",
    digest: [{ source_id: "x:example", type: "x", items: [] }],
  };
  const errors = validateRunRenderAudits(run, "/runs/new.json");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /collection_schema must be 3/);
});

test("cannot bypass the schema cutoff with a timezone offset", () => {
  const run = {
    generated_at: "2026-09-28T07:00:00-01:00",
    digest: [{ source_id: "x:example", type: "x", items: [] }],
  };
  const errors = validateRunRenderAudits(run, "/runs/new.json");
  assert.match(errors[0], /collection_schema must be 3/);
});

test("grandfathers only explicitly allowlisted historical schema-less runs", () => {
  const run = {
    generated_at: "2026-09-28T07:51:16Z",
    digest: [{ source_id: "x:example", type: "x", items: [{ url: itemUrl }] }],
  };
  assert.deepEqual(validateRunRenderAudits(run, "/runs/2026-09-28T07-51-16Z.json"), []);
});

test("rejects a newly named backdated schema-less run", () => {
  const run = {
    generated_at: "2026-09-28T07:59:59Z",
    digest: [{ source_id: "x:example", type: "x", items: [{ url: itemUrl }] }],
  };
  const errors = validateRunRenderAudits(run, "/runs/backdated-new-run.json");
  assert.match(errors[0], /collection_schema must be 3/);
});

test("schema 3 gates X items but not non-X items", () => {
  const run = {
    collection_schema: 3,
    generated_at: "2026-09-28T08:00:00Z",
    digest: [
      { source_id: "x:example", items: [{ url: itemUrl }] },
      { source_id: "youtube:example", type: "youtube", items: [{ url: "https://youtube.com/watch?v=1" }] },
    ],
  };
  const errors = validateRunRenderAudits(run, "/runs/new.json");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /render_audit is required/);
});

test("cannot bypass X auditing by mislabeling an X source type", () => {
  const run = {
    collection_schema: 3,
    generated_at: "2026-09-28T08:00:00Z",
    digest: [
      { source_id: "x:example", type: "youtube", items: [{ url: itemUrl }] },
    ],
  };
  const errors = validateRunRenderAudits(run, "/runs/new.json");
  assert.ok(errors.some((error) => /X source cannot declare non-X type/.test(error)));
  assert.ok(errors.some((error) => /render_audit is required/.test(error)));
});

test("rejects a non-X item URL inside an X source", () => {
  const wrongUrl = "https://www.youtube.com/watch?v=1";
  const value = item({ url: wrongUrl });
  value.render_audit.root_article_url = wrongUrl;
  const run = {
    collection_schema: 3,
    generated_at: "2026-09-28T08:00:00Z",
    digest: [{ source_id: "x:example", type: "x", items: [value] }],
  };
  const errors = validateRunRenderAudits(run, "/runs/new.json");
  assert.ok(errors.some((error) => /X item URL must be a canonical X status URL/.test(error)));
});

test("rejects inspection timestamps after run generation", () => {
  const value = item({ published_at: "2026-09-28T07:00:00Z" });
  value.render_audit.inspected_at = "2026-09-28T09:00:00Z";
  const run = {
    collection_schema: 3,
    generated_at: "2026-09-28T08:00:00Z",
    digest: [{ source_id: "x:example", type: "x", items: [value] }],
  };
  const errors = validateRunRenderAudits(run, "/runs/new.json");
  assert.ok(errors.some((error) => /inspected_at cannot be after run generated_at/.test(error)));
});
