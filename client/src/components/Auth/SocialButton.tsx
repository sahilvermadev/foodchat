import React from 'react';

const SocialButton = ({ id, enabled, serverDomain, oauthPath, Icon, label }) => {
  if (!enabled) {
    return null;
  }

  return (
    <div className="mt-2 flex gap-x-2">
      <a
        aria-label={`${label}`}
        className="flex w-full items-center space-x-3 rounded-2xl border border-[var(--rekky-linen)] bg-[var(--rekky-alabaster)] px-5 py-3 font-sans text-[var(--rekky-charcoal)] transition-colors duration-200 hover:bg-[var(--rekky-soft-clay)] dark:border-white/10 dark:bg-[var(--rekky-plum-850)] dark:text-[var(--rekky-cream-text)] dark:hover:bg-[var(--rekky-plum-800)]"
        href={`${serverDomain}/oauth/${oauthPath}`}
        data-testid={id}
      >
        <Icon />
        <p>{label}</p>
      </a>
    </div>
  );
};

export default SocialButton;
