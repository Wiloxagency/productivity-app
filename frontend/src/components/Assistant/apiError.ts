import { isAxiosError } from 'axios';

export const apiErrorMessage = (err: unknown, fallback: string) => {
  if (isAxiosError(err)) return (err.response?.data as { error?: string } | undefined)?.error || err.message || fallback;
  return err instanceof Error ? err.message : fallback;
};
