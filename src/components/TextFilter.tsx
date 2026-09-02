"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { usePendingRouter } from "@/components/NavigationPending";

export function TextFilter({ name, placeholder }: { name: string; placeholder: string }) {
  const { push, isPending } = usePendingRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlValue = searchParams.get(name) ?? "";
  const [value, setValue] = useState(urlValue);

  useEffect(() => {
    setValue(urlValue);
  }, [urlValue]);

  function submit() {
    if (value === urlValue) return;
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(name, value);
    else params.delete(name);
    params.delete("cursor");
    params.delete("prevCursors");
    push(`${pathname}?${params.toString()}`);
  }

  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      disabled={isPending}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && submit()}
      onBlur={submit}
    />
  );
}
