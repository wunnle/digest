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
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/$/, "");
    return url.href;
  } catch {
    return null;
  }
}

const isPositiveNumber = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;

/** Validate the optional rendered attachments captured from an X post. */
export function validateAttachments(attachments, at, itemUrl) {
  if (attachments === undefined) return [];
  if (!Array.isArray(attachments)) return [`${at}: attachments must be a list`];

  const errors = [];
  attachments.forEach((attachment, index) => {
    const field = `${at}: attachments[${index}]`;
    if (!attachment || typeof attachment !== "object") {
      errors.push(`${field} must be an object`);
      return;
    }

    if (attachment.type === "native_video") {
      if (!isHttps(attachment.poster_url)) errors.push(`${field}.poster_url must be https`);
      if (!isHttps(attachment.external_url)) {
        errors.push(`${field}.external_url must be https`);
      } else if (normalizedUrl(attachment.external_url) !== normalizedUrl(itemUrl)) {
        errors.push(`${field}.external_url must match the item URL`);
      }
      if (!isPositiveNumber(attachment.width) || !isPositiveNumber(attachment.height)) {
        errors.push(`${field} must have positive numeric width and height`);
      }
      if (attachment.duration !== undefined && !isPositiveNumber(attachment.duration)) {
        errors.push(`${field}.duration must be a positive number when present`);
      }
      if (attachment.playback_url !== undefined && !isHttps(attachment.playback_url)) {
        errors.push(`${field}.playback_url must be https when present`);
      }
      return;
    }

    if (attachment.type === "link_card") {
      if (!isHttps(attachment.url)) errors.push(`${field}.url must be https`);
      if (typeof attachment.title !== "string" || !attachment.title.trim()) {
        errors.push(`${field}.title must be a non-empty string`);
      }
      if (
        attachment.publisher !== undefined &&
        (typeof attachment.publisher !== "string" || !attachment.publisher.trim())
      ) {
        errors.push(`${field}.publisher must be a non-empty string when present`);
      }
      if (attachment.thumbnail_url !== undefined && !isHttps(attachment.thumbnail_url)) {
        errors.push(`${field}.thumbnail_url must be https when present`);
      }
      return;
    }

    errors.push(`${field}: unknown attachment type`);
  });
  return errors;
}
