import React from 'react';

import { clearExplicitLogout } from '~/utils';

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
        onClick={clearExplicitLogout}
        data-testid={id}
      >
        <Icon />
        <p>{label}</p>
      </a>
    </div>
  );
};

export default SocialButton;
