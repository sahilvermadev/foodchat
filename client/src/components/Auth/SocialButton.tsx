import React from 'react';

import {
  clearExplicitLogout,
  getAuthMode,
  getPublicReturnTarget,
  persistRedirectToSession,
} from '~/utils';

const SocialButton = ({ id, enabled, serverDomain, oauthPath, Icon, label }) => {
  if (!enabled) {
    return null;
  }

  return (
    <div className="mt-2 flex gap-x-2">
      <a
        aria-label={`${label}`}
        className="flex w-full items-center space-x-3 rounded-full border border-border-medium bg-surface-primary-alt px-5 py-3 text-text-primary transition-colors duration-200 hover:bg-surface-hover"
        href={`${serverDomain}/oauth/${oauthPath}`}
        onClick={() => {
          clearExplicitLogout();
          const searchParams = new URLSearchParams(window.location.search);
          persistRedirectToSession(
            getAuthMode(searchParams)
              ? '/cook'
              : getPublicReturnTarget(
                  window.location.pathname,
                  window.location.search,
                  window.location.hash,
                ),
          );
        }}
        data-testid={id}
      >
        <Icon />
        <p>{label}</p>
      </a>
    </div>
  );
};

export default SocialButton;
