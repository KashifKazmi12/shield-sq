"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { ChangePasswordForm } from "./settings/ChangePasswordForm";

function initials(email?: string | null) {
  if (!email) return "?";
  return email.slice(0, 2).toUpperCase();
}

export function UserMenu({ email }: { email?: string | null }) {
  const [open, setOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <>
      <div className="user-menu" ref={menuRef}>
        <button
          type="button"
          className="user-menu-trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="avatar">{initials(email)}</span>
          <svg className="user-menu-caret" width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M4.427 6.427 8 10l3.573-3.573a.25.25 0 0 1 .354.354l-3.75 3.75a.25.25 0 0 1-.354 0l-3.75-3.75a.25.25 0 0 1 .354-.354Z" />
          </svg>
        </button>
        {open && (
          <div className="user-menu-dropdown" role="menu">
            <div className="user-menu-email">{email}</div>
            <button
              type="button"
              role="menuitem"
              className="user-menu-item"
              onClick={() => {
                setOpen(false);
                setModalOpen(true);
              }}
            >
              Change password
            </button>
            <button
              type="button"
              role="menuitem"
              className="user-menu-item danger"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              Sign out
            </button>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Change password</h3>
            <ChangePasswordForm onSuccess={() => setModalOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
