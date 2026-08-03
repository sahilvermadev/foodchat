import { useEffect } from 'react';

type PublicMetadata = {
  description?: string;
  image?: string;
  title?: string;
};

type MetaChange = {
  created: boolean;
  element: HTMLMetaElement;
  previous: string | null;
};

function upsertMeta(selector: string, attribute: string, value: string): MetaChange {
  const existing = document.head.querySelector<HTMLMetaElement>(selector);
  const element = existing ?? document.createElement('meta');
  if (!existing) document.head.appendChild(element);
  const previous = element.getAttribute(attribute);
  element.setAttribute(attribute, value);
  return { created: !existing, element, previous };
}

function restoreMeta(change: MetaChange | undefined, attribute: string): void {
  if (!change) return;
  if (change.created) {
    change.element.remove();
    return;
  }
  if (change.previous == null) change.element.removeAttribute(attribute);
  else change.element.setAttribute(attribute, change.previous);
}

export default function usePublicMetadata({ description, image, title }: PublicMetadata): void {
  useEffect(() => {
    if (!title) return;
    const previousTitle = document.title;
    document.title = `${title} · Rekky`;
    const descriptionMeta = description
      ? upsertMeta('meta[name="description"]', 'content', description)
      : undefined;
    const titleMeta = upsertMeta('meta[property="og:title"]', 'content', title);
    const typeMeta = upsertMeta('meta[property="og:type"]', 'content', 'website');
    const imageMeta = image
      ? upsertMeta(
          'meta[property="og:image"]',
          'content',
          new URL(image, window.location.origin).toString(),
        )
      : undefined;

    return () => {
      document.title = previousTitle;
      restoreMeta(descriptionMeta, 'content');
      restoreMeta(titleMeta, 'content');
      restoreMeta(typeMeta, 'content');
      restoreMeta(imageMeta, 'content');
    };
  }, [description, image, title]);
}
