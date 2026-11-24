import { QueryClient } from '@tanstack/react-query';

/** One shared client, so code outside React (a notification button tap) can refresh the screens too. */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } },
});
