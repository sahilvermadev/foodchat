import { useEffect, useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import { useLocalize } from '~/hooks';

type ShareActionProps = {
  className?: string;
  showLabel?: boolean;
  title: string;
  url: string;
};

export default function ShareAction({
  className = '',
  showLabel = true,
  title,
  url,
}: ShareActionProps) {
  const localize = useLocalize();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const share = async () => {
    const absoluteUrl = new URL(url, window.location.origin).toString();
    if (navigator.share) {
      try {
        await navigator.share({ title, url: absoluteUrl });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    await navigator.clipboard.writeText(absoluteUrl);
    setCopied(true);
  };

  return (
    <button
      type="button"
      onClick={() => void share()}
      className={className}
      aria-label={localize(copied ? 'com_public_link_copied' : 'com_public_share')}
    >
      {copied ? (
        <Check className="size-4" aria-hidden="true" />
      ) : (
        <Share2 className="size-4" aria-hidden="true" />
      )}
      <span className={showLabel ? undefined : 'sr-only'}>
        {localize(copied ? 'com_public_link_copied' : 'com_public_share')}
      </span>
    </button>
  );
}
