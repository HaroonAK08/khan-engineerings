"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { apiError } from "@/lib/materials-api";
import { invalidationGroups, type InvalidationGroup } from "./keys";

/**
 * Query function signature. React Query hands every query function an
 * AbortSignal; passing it through to axios is what makes a superseded request
 * (changed date range, changed search, unmounted screen) actually stop, so a
 * slow earlier response can no longer land after a fast later one.
 */
export type Fetcher<T> = (signal: AbortSignal) => Promise<T>;

type AppQueryOptions<T> = Omit<
  UseQueryOptions<T, unknown, T, QueryKey>,
  "queryKey" | "queryFn"
>;

/** Thin wrapper that wires the AbortSignal through for every caller. */
export function useAppQuery<T>(
  key: QueryKey,
  fetcher: Fetcher<T>,
  options?: AppQueryOptions<T>
) {
  return useQuery<T, unknown, T, QueryKey>({
    queryKey: key,
    queryFn: ({ signal }) => fetcher(signal),
    ...options,
  });
}

type AppMutationOptions<TData, TVars> = Omit<
  UseMutationOptions<TData, unknown, TVars>,
  "mutationFn"
> & {
  /** Domains to invalidate on success — see invalidationGroups. */
  invalidates?: InvalidationGroup | InvalidationGroup[];
  /** Extra keys to invalidate beyond the group (e.g. one record's detail). */
  invalidateKeys?: QueryKey[];
  successMessage?: string;
  /** Fallback text when the server sends no message. */
  errorMessage?: string;
};

/**
 * Mutation wrapper with consistent feedback and invalidation.
 *
 * Caches are invalidated rather than optimistically patched. Stock and money
 * figures here are derived server-side (payment allocation re-runs across a
 * whole party, a sale moves several ledgers), so a client-side guess at the new
 * value would frequently be wrong — and wrong in the one place it matters.
 */
export function useAppMutation<TData, TVars>(
  mutationFn: (vars: TVars) => Promise<TData>,
  options: AppMutationOptions<TData, TVars> = {}
) {
  const queryClient = useQueryClient();
  const {
    invalidates,
    invalidateKeys,
    successMessage,
    errorMessage,
    onSuccess,
    onError,
    ...rest
  } = options;

  return useMutation<TData, unknown, TVars>({
    mutationFn,
    ...rest,
    onSuccess: async (data, vars, ...callbackRest) => {
      const groups = Array.isArray(invalidates)
        ? invalidates
        : invalidates
          ? [invalidates]
          : [];
      const keys: QueryKey[] = [
        ...groups.flatMap((g) => invalidationGroups[g].map((k) => [...k])),
        ...(invalidateKeys ?? []),
      ];
      await Promise.all(
        keys.map((key) => queryClient.invalidateQueries({ queryKey: key }))
      );
      if (successMessage) toast.success(successMessage);
      await (onSuccess as ((...args: unknown[]) => unknown) | undefined)?.(
        data,
        vars,
        ...callbackRest
      );
    },
    onError: (error, vars, ...callbackRest) => {
      // A 409 duplicate-confirmation is a question for the user, not a failure;
      // the calling form handles it through withSameDayConfirm.
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status !== 409) {
        toast.error(apiError(error, errorMessage ?? "Something went wrong"));
      }
      (onError as ((...args: unknown[]) => unknown) | undefined)?.(
        error,
        vars,
        ...callbackRest
      );
    },
  });
}

/** Imperative invalidation for flows that are not expressed as a mutation. */
export function useInvalidate() {
  const queryClient = useQueryClient();
  return (groups: InvalidationGroup | InvalidationGroup[]) => {
    const list = Array.isArray(groups) ? groups : [groups];
    return Promise.all(
      list.flatMap((g) =>
        invalidationGroups[g].map((key) =>
          queryClient.invalidateQueries({ queryKey: [...key] })
        )
      )
    );
  };
}
