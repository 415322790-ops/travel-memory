function classifyImageSize(width, height) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const aspectRatio = safeWidth / safeHeight;
  let orientation = 'square';
  if (aspectRatio > 1.2) orientation = 'landscape';
  if (aspectRatio < 0.83) orientation = 'portrait';
  return {
    width: safeWidth,
    height: safeHeight,
    aspectRatio,
    orientation,
  };
}

function readImageElement(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const metadata = classifyImageSize(image.naturalWidth, image.naturalHeight);
      URL.revokeObjectURL(url);
      resolve(metadata);
    };
    image.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };
    image.src = url;
  });
}

export async function readImageMetadata(file) {
  if (!file) return null;

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const metadata = classifyImageSize(bitmap.width, bitmap.height);
      if (typeof bitmap.close === 'function') bitmap.close();
      return metadata;
    } catch {
      // 部分浏览器不支持 imageOrientation，继续使用 Image 兜底。
    }
  }

  const objectUrl = URL.createObjectURL(file);
  return readImageElement(objectUrl);
}