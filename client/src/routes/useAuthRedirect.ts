import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { buildLoginRedirectUrl } from 'librechat-data-provider';
import { useAuthContext } from '~/hooks';

export default function useAuthRedirect({ allowGuest = false }: { allowGuest?: boolean } = {}) {
  const { user, roles, isAuthenticated, isLoggingOut } = useAuthContext();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (isAuthenticated) {
        return;
      }
      if (isLoggingOut) {
        return;
      }
      if (allowGuest) {
        return;
      }

      navigate(buildLoginRedirectUrl(location.pathname, location.search, location.hash), {
        replace: true,
      });
    }, 300);

    return () => {
      clearTimeout(timeout);
    };
  }, [allowGuest, isAuthenticated, isLoggingOut, navigate, location]);

  return {
    user,
    roles,
    isAuthenticated,
  };
}
