"use client";

import {
  createContext,
  useCallback,
  useContext,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

type PendingRouter = {
  isPending: boolean;
  push: (href: string, opts?: { scroll?: boolean }) => void;
  replace: (href: string) => void;
};

const NavigationPendingContext = createContext<PendingRouter | null>(null);

export function NavigationPendingProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const push = useCallback(
    (href: string, opts?: { scroll?: boolean }) => {
      startTransition(() => {
        router.push(href, opts);
      });
    },
    [router]
  );

  const replace = useCallback(
    (href: string) => {
      startTransition(() => {
        router.replace(href);
      });
    },
    [router]
  );

  return (
    <NavigationPendingContext.Provider value={{ isPending, push, replace }}>
      {children}
    </NavigationPendingContext.Provider>
  );
}

export function usePendingRouter(): PendingRouter {
  const ctx = useContext(NavigationPendingContext);
  const router = useRouter();
  if (!ctx) {
    return {
      isPending: false,
      push: (href, opts) => router.push(href, opts),
      replace: (href) => router.replace(href),
    };
  }
  return ctx;
}

export function useNavigationPending() {
  return usePendingRouter().isPending;
}

/** Full-page blur overlay + spinner while dashboard navigation is pending. */
export function NavigationPendingUI() {
  const isPending = useNavigationPending();
  if (!isPending) return null;

  return (
    <div className="page-loading-overlay" aria-busy="true" aria-live="polite" role="status">
      <div className="page-loading-card">
        <span className="page-loading-spinner" />
        <span>Loading…</span>
      </div>
    </div>
  );
}
