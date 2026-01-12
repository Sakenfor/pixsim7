/**
 * Picker Scan - Page image scanning
 */
(function() {
  'use strict';

  window.PXS7 = window.PXS7 || {};
  window.PXS7.picker = window.PXS7.picker || {};

  const { normalizeUrl, extractImageUrl } = window.PXS7.utils || {};

  // UUID pattern for valid user content
  const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  // Patterns to exclude (UI assets, not user content)
  const EXCLUDE_PATTERNS = [
    /profile-picture/i,
    /asset\/media\/model/i,
    /\/model-.*\.png/i,
    /\/icon/i,
    /\/logo/i,
    /\/avatar/i,
  ];

  function isValidUserImage(url) {
    if (!url) return false;
    if (!UUID_PATTERN.test(url)) return false;
    for (const pattern of EXCLUDE_PATTERNS) {
      if (pattern.test(url)) return false;
    }
    return true;
  }

  function scanPageForImages() {
    const images = new Set();

    // Scan pixverse images
    document.querySelectorAll('img[src*="media.pixverse.ai"]').forEach(img => {
      const src = normalizeUrl ? normalizeUrl(img.src) : img.src;
      if (isValidUserImage(src)) images.add(src);
    });

    // Check background-image styles
    document.querySelectorAll('[style*="media.pixverse.ai"]').forEach(el => {
      const src = extractImageUrl ? extractImageUrl(el.getAttribute('style')) : null;
      if (src && isValidUserImage(src)) images.add(src);
    });

    return Array.from(images);
  }

  function scanUploadContainerImages() {
    const images = new Set();
    const containers = document.querySelectorAll('.ant-upload-wrapper, .ant-upload, [class*="ant-upload"]');

    containers.forEach(container => {
      container.querySelectorAll('img[src*="media.pixverse.ai"], img[src*="aliyun"]').forEach(img => {
        const src = normalizeUrl ? normalizeUrl(img.src) : img.src;
        if (src && src.length > 50) images.add(src);
      });

      container.querySelectorAll('[style*="media.pixverse.ai"]').forEach(el => {
        const src = extractImageUrl ? extractImageUrl(el.getAttribute('style')) : null;
        if (src) images.add(src);
      });
    });

    return Array.from(images);
  }

  // Export
  window.PXS7.picker.scan = {
    isValidUserImage,
    scanPageForImages,
    scanUploadContainerImages,
  };
})();
