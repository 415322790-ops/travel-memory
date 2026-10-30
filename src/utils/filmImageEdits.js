import { getPhotoObjectUrl } from '../storage/travelDb';

const editedImageCache = new Map();

export function normalizeRotation(value) {
  const turns = Math.round(Number(value || 0) / 90);
  return ((turns % 4) + 4) % 4 * 90;
}

export function detectImageOrientation(width, height) {
  const imageWidth = Number(width);
  const imageHeight = Number(height);
  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth <= 0 || imageHeight <= 0) return 'square';
  const difference = Math.abs(imageWidth - imageHeight) / Math.max(imageWidth, imageHeight);
  if (difference <= 0.08) return 'square';
  return imageWidth > imageHeight ? 'landscape' : 'portrait';
}

export function getFilmTargetOrientation(format) {
  if (format === 'landscape' || format === 'portrait' || format === 'square') return format;
  if (format && typeof format === 'object' && format.orientation) return getFilmTargetOrientation(format.orientation);
  const ratio = Number(format?.frameRatio ?? format);
  if (!Number.isFinite(ratio) || ratio <= 0 || Math.abs(ratio - 1) <= 0.08) return 'square';
  return ratio > 1 ? 'landscape' : 'portrait';
}

export function getAutoRotationTurns(source, targetOrientation) {
  const target = getFilmTargetOrientation(targetOrientation);
  const sourceOrientation = typeof source === 'string'
    ? source
    : detectImageOrientation(source?.width, source?.height);
  if (sourceOrientation === 'square' || target === 'square' || sourceOrientation === target) return 0;
  return 1;
}

export function getFinalRotation(photo, targetOrientation) {
  const source = photo?.orientation || detectImageOrientation(photo?.width, photo?.height);
  const autoTurns = getAutoRotationTurns(source, targetOrientation);
  return normalizeRotation(autoTurns * 90 + Number(photo?.rotation || 0));
}

export function getRotatedDimensions(width, height, rotation = 0) {
  const imageWidth = Math.max(1, Number(width) || 1);
  const imageHeight = Math.max(1, Number(height) || 1);
  return normalizeRotation(rotation) % 180
    ? { width: imageHeight, height: imageWidth }
    : { width: imageWidth, height: imageHeight };
}

export function normalizeCrop(crop) {
  if (!crop || typeof crop !== 'object') return null;
  const x = Math.max(0, Math.min(1, Number(crop.x) || 0));
  const y = Math.max(0, Math.min(1, Number(crop.y) || 0));
  const width = Math.max(0, Math.min(1 - x, Number(crop.width ?? crop.w) || 0));
  const height = Math.max(0, Math.min(1 - y, Number(crop.height ?? crop.h) || 0));
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

export function isFullCrop(crop) {
  const normalized = normalizeCrop(crop);
  return !normalized || (
    normalized.x <= 0 &&
    normalized.y <= 0 &&
    normalized.width >= 1 &&
    normalized.height >= 1
  );
}

export function rotateCropClockwise(crop) {
  const normalized = normalizeCrop(crop);
  if (!normalized) return null;
  return normalizeCrop({
    x: 1 - normalized.y - normalized.height,
    y: normalized.x,
    width: normalized.height,
    height: normalized.width,
  });
}

export function getPhotoEditSignature(photo, includeCrop = true, targetOrientation = '', sourceUrl = photo?.url || '') {
  const rotation = normalizeRotation(photo?.rotation);
  const crop = includeCrop ? normalizeCrop(photo?.crop) : null;
  return [
    sourceUrl,
    getFilmTargetOrientation(targetOrientation),
    photo?.orientation || '',
    photo?.width || '',
    photo?.height || '',
    rotation,
    crop ? [crop.x, crop.y, crop.width, crop.height].join(',') : '',
  ].join('|');
}

function getImageSize(image) {
  return {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  };
}

async function loadImage(url) {
  if (typeof createImageBitmap === 'function' && typeof fetch === 'function') {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('图片加载失败');
      const blob = await response.blob();
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      // 跨域图片或旧浏览器无法创建 ImageBitmap 时使用 img 回退。
    }
  }
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败'));
    image.src = url;
  });
}

function closeImageSource(source) {
  if (source && typeof source.close === 'function') source.close();
}

function drawRotated(source, rotation) {
  const { width, height } = getImageSize(source);
  const turns = normalizeRotation(rotation) / 90;
  if (!turns) return source;
  const canvas = document.createElement('canvas');
  canvas.width = turns % 2 ? height : width;
  canvas.height = turns % 2 ? width : height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器不支持图片编辑');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.save();
  if (turns === 1) {
    context.translate(canvas.width, 0);
    context.rotate(Math.PI / 2);
  } else if (turns === 2) {
    context.translate(canvas.width, canvas.height);
    context.rotate(Math.PI);
  } else if (turns === 3) {
    context.translate(0, canvas.height);
    context.rotate(-Math.PI / 2);
  }
  context.drawImage(source, 0, 0, width, height);
  context.restore();
  return canvas;
}

function cropCanvas(source, crop) {
  const normalized = normalizeCrop(crop);
  if (!normalized || isFullCrop(normalized)) return source;
  const x = Math.max(0, Math.min(source.width - 1, Math.floor(normalized.x * source.width)));
  const y = Math.max(0, Math.min(source.height - 1, Math.floor(normalized.y * source.height)));
  const right = Math.max(x + 1, Math.min(source.width, Math.ceil((normalized.x + normalized.width) * source.width)));
  const bottom = Math.max(y + 1, Math.min(source.height, Math.ceil((normalized.y + normalized.height) * source.height)));
  const canvas = document.createElement('canvas');
  canvas.width = right - x;
  canvas.height = bottom - y;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器不支持图片编辑');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, x, y, right - x, bottom - y, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function getEditedImageUrl(photo, { includeCrop = true, targetOrientation = '' } = {}) {
  const sourceUrl = photo?.url || await getPhotoObjectUrl(photo?.assetId || photo?.id);
  if (!sourceUrl) return '';
  const rotation = normalizeRotation(photo.rotation);
  const crop = includeCrop ? normalizeCrop(photo.crop) : null;

  const signature = getPhotoEditSignature(photo, includeCrop, targetOrientation, sourceUrl);
  if (editedImageCache.has(signature)) return editedImageCache.get(signature);
  const promise = loadImage(sourceUrl).then((source) => {
    try {
      const { width, height } = getImageSize(source);
      const sourceOrientation = photo.orientation || detectImageOrientation(width, height);
      const autoTurns = getAutoRotationTurns(sourceOrientation, targetOrientation);
      const autoRotated = drawRotated(source, autoTurns * 90);
      const rotated = drawRotated(autoRotated, rotation);
      const edited = cropCanvas(rotated, crop);
      if (!autoTurns && !rotation && isFullCrop(crop)) return sourceUrl;
      return edited.toDataURL('image/png');
    } finally {
      closeImageSource(source);
    }
  });
  editedImageCache.set(signature, promise);
  try {
    return await promise;
  } catch (error) {
    editedImageCache.delete(signature);
    throw error;
  }
}

export async function loadEditedImage(photo, options) {
  const url = await getEditedImageUrl(photo, options);
  return loadImage(url);
}
