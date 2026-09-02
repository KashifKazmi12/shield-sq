"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePendingRouter } from "@/components/NavigationPending";

/** Next Link that shows the dashboard pending overlay while the route loads. */
export function PendingLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const { push, isPending } = usePendingRouter();

  return (
    <Link
      href={href}
      className={className}
      aria-disabled={isPending}
      onClick={(e) => {
        e.preventDefault();
        if (isPending) return;
        push(href);
      }}
    >
      {children}
    </Link>
  );
}
