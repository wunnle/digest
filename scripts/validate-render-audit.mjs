function isHttps(value) {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function normalizedUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.searchParams.delete("feature");
    url.searchParams.delete("is");
    url.pathname = url.pathname.replace(/\/$/, "");
    return url.href;
  } catch {
    return null;
  }
}

const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const X_STATUS = /^https:\/\/(?:www\.)?x\.com\/[^/]+\/status\/\d+\/?$/;
const LEGACY_RUN_FILES = new Set([
  "2026-09-24T04-17-31Z.json",
  "2026-09-25T10-18-47Z.json",
  "2026-09-25T10-30-34Z.json",
  "2026-09-25T10-33-54Z.json",
  "2026-09-25T10-50-53Z.json",
  "2026-09-25T11-52-07Z.json",
  "2026-09-25T11-58-24Z.json",
  "2026-09-26T06-06-16Z.json",
  "2026-09-27T04-11-24Z.json",
  "2026-09-28T07-37-31Z.json",
  "2026-09-28T07-47-23Z.json",
  "2026-09-28T07-51-16Z.json",
]);

function stateErrors(state, field) {
  if (!state || typeof state !== "object" || typeof state.visible !== "boolean") {
    return [`${field} must be an object with boolean visible`];
  }
  return [];
}

/**
 * Validate the browser-render evidence attached to a freshly collected X item.
 * This is required only for collection_schema >= 3; older append-only runs are
 * deliberately left readable by the caller.
 */
export function validateRenderAudit(item, at, runGeneratedAt) {
  const audit = item?.render_audit;
  if (!audit || typeof audit !== "object") return [`${at}: render_audit is required for v3 X items`];

  const errors = [];
  if (!isHttps(audit.root_article_url) || normalizedUrl(audit.root_article_url) !== normalizedUrl(item.url)) {
    errors.push(`${at}: render_audit.root_article_url must match the item URL`);
  }
  if (
    typeof audit.inspected_at !== "string" ||
    !UTC_ISO.test(audit.inspected_at) ||
    Number.isNaN(Date.parse(audit.inspected_at))
  ) {
    errors.push(`${at}: render_audit.inspected_at must be a UTC ISO timestamp`);
  } else {
    const inspectedMs = Date.parse(audit.inspected_at);
    const publishedMs = Date.parse(item.published_at);
    const generatedMs = Date.parse(runGeneratedAt);
    if (Number.isFinite(publishedMs) && inspectedMs < publishedMs) {
      errors.push(`${at}: render_audit.inspected_at cannot be before item publication`);
    }
    if (Number.isFinite(generatedMs) && inspectedMs > generatedMs) {
      errors.push(`${at}: render_audit.inspected_at cannot be after run generated_at`);
    }
  }

  const quoteField = `${at}: render_audit.quote_card`;
  const linkField = `${at}: render_audit.external_link_card`;
  const videoField = `${at}: render_audit.native_video`;
  errors.push(...stateErrors(audit.quote_card, quoteField));
  errors.push(...stateErrors(audit.external_link_card, linkField));
  errors.push(...stateErrors(audit.native_video, videoField));

  if (audit.quote_card?.visible === true) {
    if (!isHttps(audit.quote_card.status_url) || !X_STATUS.test(audit.quote_card.status_url)) {
      errors.push(`${quoteField}.status_url must be a canonical https X status URL when visible`);
    } else if (!item.quote_tweet) {
      errors.push(`${at}: visible quote card requires quote_tweet`);
    } else if (normalizedUrl(item.quote_tweet.url) !== normalizedUrl(audit.quote_card.status_url)) {
      errors.push(`${at}: quote_tweet.url must match render_audit.quote_card.status_url`);
    }
  } else if (audit.quote_card?.visible === false && item.quote_tweet) {
    errors.push(`${at}: quote_tweet requires quote_card.visible true`);
  }

  const linkAttachments = (item.attachments ?? []).filter((attachment) => attachment?.type === "link_card");
  if (audit.external_link_card?.visible === true) {
    if (!isHttps(audit.external_link_card.final_url)) {
      errors.push(`${linkField}.final_url must be https when visible`);
    } else {
      const matched = linkAttachments.some(
        (attachment) => normalizedUrl(attachment.url) === normalizedUrl(audit.external_link_card.final_url),
      );
      if (!matched) errors.push(`${at}: visible external link card requires a matching link_card attachment`);
    }
  } else if (audit.external_link_card?.visible === false && linkAttachments.length > 0) {
    errors.push(`${at}: link_card attachment requires external_link_card.visible true`);
  }

  const videoAttachments = (item.attachments ?? []).filter((attachment) => attachment?.type === "native_video");
  if (audit.native_video?.visible === true) {
    if (videoAttachments.length === 0) {
      errors.push(`${at}: visible native video requires a native_video attachment`);
    }
  } else if (audit.native_video?.visible === false && videoAttachments.length > 0) {
    errors.push(`${at}: native_video attachment requires native_video.visible true`);
  }

  return errors;
}

/** Validate schema migration and every schema-3 X item at run level. */
export function validateRunRenderAudits(run, where) {
  const errors = [];
  const generatedAt = typeof run?.generated_at === "string" ? run.generated_at : "";
  const runFile = String(where).split("/").at(-1);
  const isLegacy = LEGACY_RUN_FILES.has(runFile);

  if (run?.collection_schema !== undefined && run.collection_schema !== 3) {
    errors.push(`${where}: collection_schema must be 3 when present`);
    return errors;
  }
  if (run?.collection_schema === undefined && !isLegacy) {
    errors.push(`${where}: collection_schema must be 3 for every non-legacy run`);
    return errors;
  }
  if (run?.collection_schema !== 3) return errors;

  for (const entry of run.digest ?? []) {
    const sourceIdIsX = typeof entry.source_id === "string" && entry.source_id.toLowerCase().startsWith("x:");
    const itemUrlIsX = (entry.items ?? []).some((item) => /^https:\/\/(?:www\.)?x\.com\//i.test(item?.url ?? ""));
    const isX = sourceIdIsX || itemUrlIsX || (entry.type ?? "x") === "x";
    if (!isX) continue;
    if ((sourceIdIsX || itemUrlIsX) && entry.type !== undefined && entry.type !== "x") {
      errors.push(`${where}: ${entry.source_id ?? "X entry"}: X source cannot declare non-X type ${entry.type}`);
    }
    for (const item of entry.items ?? []) {
      const at = `${where}: ${item.url ?? "(no url)"}`;
      if (!X_STATUS.test(item.url ?? "")) {
        errors.push(`${at}: X item URL must be a canonical X status URL`);
      }
      errors.push(...validateRenderAudit(item, at, generatedAt));
    }
  }
  return errors;
}
