import sharp from 'sharp';

export type IllustrationMedia = {
  buffer: Buffer;
  contentType: string;
};

const imageDataUrlPattern = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([a-zA-Z0-9+/=\s]+)$/;
const thumbnailWidth = 480;

export function decodeIllustrationDataUrl(dataUrl?: string): IllustrationMedia | null {
  if (!dataUrl) {
    return null;
  }

  const match = dataUrl.match(imageDataUrlPattern);
  if (!match) {
    return null;
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0) {
    return null;
  }

  return {
    buffer,
    contentType: match[1] === 'image/jpg' ? 'image/jpeg' : match[1],
  };
}

export async function createIllustrationThumbnail(
  media: IllustrationMedia,
): Promise<IllustrationMedia> {
  const buffer = await sharp(media.buffer)
    .rotate()
    .resize({ width: thumbnailWidth, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();

  return { buffer, contentType: 'image/webp' };
}
