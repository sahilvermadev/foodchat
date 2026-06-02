import { useSetRecoilState } from 'recoil';
import { useNavigate } from 'react-router-dom';
import { setTokenHeader } from 'librechat-data-provider';
import type { Dispatch, SetStateAction } from 'react';
import type { TLoginResponse, TLoginUser } from 'librechat-data-provider';
import type { TResError } from '~/common';
import { useLoginUserMutation } from '~/data-provider';
import { buildLoginRetryRedirect, buildTwoFactorRedirect, resolvePostLoginRedirect } from '~/utils';
import store from '~/store';

type UsePublicLoginOptions = {
  setError?: Dispatch<SetStateAction<string | undefined>>;
};

export default function usePublicLogin({ setError }: UsePublicLoginOptions = {}) {
  const navigate = useNavigate();
  const setUser = useSetRecoilState(store.user);
  const setQueriesEnabled = useSetRecoilState<boolean>(store.queriesEnabled);

  const loginUser = useLoginUserMutation({
    onSuccess: (data: TLoginResponse) => {
      const { user, token, twoFAPending, tempToken } = data;
      if (twoFAPending) {
        navigate(buildTwoFactorRedirect(tempToken), { replace: true });
        return;
      }

      setError?.(undefined);
      setUser(user);
      setTokenHeader(token);
      setQueriesEnabled(true);

      const redirect = resolvePostLoginRedirect(
        new URLSearchParams(window.location.search),
        '/cook',
      );
      navigate(redirect ?? '/cook', { replace: true });
    },
    onError: (error: TResError | unknown) => {
      const resError = error as TResError;
      setError?.(resError.message);
      navigate(buildLoginRetryRedirect(new URLSearchParams(window.location.search)), {
        replace: true,
      });
    },
  });

  return {
    login: (data: TLoginUser) => loginUser.mutate(data),
    loginUser,
  };
}
