function toArray(input) {
  if (Array.isArray(input)) return input;
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return input
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function validateVideoUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const allowedHosts = ["youtube.com", "www.youtube.com", "youtu.be", "vimeo.com", "www.vimeo.com"];
    if (!allowedHosts.includes(host)) {
      return "Video URL must be from YouTube or Vimeo.";
    }
    return null;
  } catch (error) {
    return "Video URL is invalid.";
  }
}

function validateBlogPayload(payload, { isUpdate = false } = {}) {
  const errors = [];
  const data = { ...payload };

  if (!isUpdate || Object.prototype.hasOwnProperty.call(data, "title")) {
    if (!data.title || typeof data.title !== "string" || !data.title.trim()) {
      errors.push("Title is required.");
    }
  }

  if (!isUpdate || Object.prototype.hasOwnProperty.call(data, "contentHtml")) {
    if (!data.contentHtml || typeof data.contentHtml !== "string" || !data.contentHtml.trim()) {
      errors.push("Content is required.");
    }
  }

  if (data.status && !["draft", "published"].includes(String(data.status))) {
    errors.push("Status must be either draft or published.");
  }

  const videoError = validateVideoUrl(data.videoUrl);
  if (videoError) errors.push(videoError);

  if (data.seoTitle && String(data.seoTitle).length > 255) {
    errors.push("SEO title cannot exceed 255 characters.");
  }
  if (data.seoDescription && String(data.seoDescription).length > 320) {
    errors.push("SEO description cannot exceed 320 characters.");
  }

  const relatedProductIds = toArray(data.relatedProductIds)
    .map((v) => parseInt(v, 10))
    .filter((v) => Number.isInteger(v) && v > 0);
  const uniqueRelatedProductIds = [...new Set(relatedProductIds)];
  if (uniqueRelatedProductIds.length > 10) {
    errors.push("A blog can have at most 10 related products.");
  }
  const tags = toArray(data.tags).map((v) => String(v).trim()).filter(Boolean);

  return {
    errors,
    normalized: {
      ...data,
      title: data.title != null ? String(data.title).trim() : data.title,
      excerpt: data.excerpt != null ? String(data.excerpt).trim() : null,
      contentHtml: data.contentHtml != null ? String(data.contentHtml) : data.contentHtml,
      featuredImageAlt: data.featuredImageAlt != null ? String(data.featuredImageAlt).trim() : null,
      videoUrl: data.videoUrl != null ? String(data.videoUrl).trim() : null,
      authorName: data.authorName != null ? String(data.authorName).trim() : null,
      seoTitle: data.seoTitle != null ? String(data.seoTitle).trim() : null,
      seoDescription: data.seoDescription != null ? String(data.seoDescription).trim() : null,
      seoKeywords: data.seoKeywords != null ? String(data.seoKeywords).trim() : null,
      canonicalUrl: data.canonicalUrl != null ? String(data.canonicalUrl).trim() : null,
      status: data.status ? String(data.status) : undefined,
      isFeatured: data.isFeatured === true || data.isFeatured === "true" || data.isFeatured === 1 || data.isFeatured === "1",
      tags,
      relatedProductIds: uniqueRelatedProductIds,
    },
  };
}

module.exports = {
  validateBlogPayload,
  toArray,
};
