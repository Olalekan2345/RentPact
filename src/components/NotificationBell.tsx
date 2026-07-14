"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { Address } from "viem";
import { BellIcon } from "@/components/icons/NavIcons";
import { LogoMark } from "@/components/Logo";
import { formatDate } from "@/lib/format";
import {
  getNotifications,
  markNotificationsRead,
  fetchNotificationPrefs,
  type Notification,
  type NotificationCategory,
  type NotificationPrefs,
} from "@/lib/notifications";

const CATEGORY_DOT: Record<NotificationCategory, string> = {
  money: "bg-gold-400",
  lease: "bg-forest-400",
  dispute: "bg-terracotta-500",
  maintenance: "bg-terracotta-400",
  messages: "bg-ink-soft",
};

function isToday(timestamp: number): boolean {
  const d = new Date(timestamp);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export function NotificationBell({ email, address, dark = false }: { email: string; address: Address; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [onlyUrgent, setOnlyUrgent] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const refresh = () => {
    getNotifications({ email, address }).then(setNotifications);
  };

  useEffect(() => {
    fetchNotificationPrefs(email).then(setPrefs);
  }, [email]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, address]);

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const toggleOpen = () => {
    if (!open) {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) {
        const panelWidth = Math.min(380, window.innerWidth * 0.9);
        const left = dark ? rect.left : Math.max(8, rect.right - panelWidth);
        setPanelPos({ top: rect.bottom + 8, left });
      }
    }
    setOpen((v) => !v);
  };

  const enabled = (notifications ?? []).filter((n) => !prefs || prefs[n.category] !== false);
  const unreadCount = enabled.filter((n) => !n.read).length;
  const badgeLabel = unreadCount > 9 ? "9+" : String(unreadCount);

  const visible = enabled.filter((n) => !onlyUrgent || n.urgent);
  const today = visible.filter((n) => isToday(n.timestamp));
  const earlier = visible.filter((n) => !isToday(n.timestamp));

  const handleOpenNotification = async (n: Notification) => {
    setOpen(false);
    if (!n.read) {
      setNotifications((prev) => prev?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? null);
      await markNotificationsRead(email, [n.id]);
    }
  };

  const handleMarkAllRead = async () => {
    const unreadIds = (notifications ?? []).filter((n) => !n.read).map((n) => n.id);
    setNotifications((prev) => prev?.map((n) => ({ ...n, read: true })) ?? null);
    await markNotificationsRead(email, unreadIds);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        aria-label="Notifications"
        className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
          dark ? "text-cream-100/80 hover:bg-forest-600/60 hover:text-cream-50" : "text-ink-muted hover:bg-cream-300"
        }`}
      >
        <BellIcon className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-400 px-1 text-[10px] font-semibold text-forest-900">
            {badgeLabel}
          </span>
        )}
      </button>

      {open &&
        panelPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: panelPos.top, left: panelPos.left }}
            className="fixed z-50 w-[380px] max-w-[90vw] overflow-hidden rounded-lg border border-forest-100 bg-cream-50 shadow-lifted"
          >
            <div className="flex items-center justify-between border-b border-forest-100 px-4 py-3">
              <p className="text-sm font-semibold text-ink">Notifications</p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setOnlyUrgent((v) => !v)}
                  className={`text-xs font-medium ${onlyUrgent ? "text-terracotta-500" : "text-ink-soft"}`}
                >
                  Only urgent
                </button>
                <button onClick={handleMarkAllRead} className="text-xs font-medium text-forest-500">
                  Mark all read
                </button>
              </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto">
              {notifications === null ? (
                <p className="px-4 py-8 text-center text-sm text-ink-soft">Loading…</p>
              ) : visible.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-ink-soft">You&apos;re all caught up 🌿</p>
              ) : (
                <>
                  {today.length > 0 && (
                    <NotificationGroup label="Today" items={today} onOpen={handleOpenNotification} />
                  )}
                  {earlier.length > 0 && (
                    <NotificationGroup label="Earlier" items={earlier} onOpen={handleOpenNotification} />
                  )}
                </>
              )}
            </div>

            <div className="border-t border-forest-100 px-4 py-2.5 text-center">
              <Link
                href="/settings/notifications"
                onClick={() => setOpen(false)}
                className="text-xs font-medium text-ink-soft underline"
              >
                Notification settings
              </Link>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function NotificationGroup({
  label,
  items,
  onOpen,
}: {
  label: string;
  items: Notification[];
  onOpen: (n: Notification) => void;
}) {
  return (
    <div>
      <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
      <div className="flex flex-col">
        {items.map((n) => {
          // Activity-feed items are system-generated (on-chain/lease-lifecycle events),
          // vs. messages/reviews which are user-authored — a tiny mark distinguishes
          // "RentPact did this for you" without ever going full-size in the panel.
          const isSystemGenerated = n.id.startsWith("activity:");
          return (
          <Link
            key={n.id}
            href={n.href}
            onClick={() => onOpen(n)}
            className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-cream-200"
          >
            {isSystemGenerated ? (
              <LogoMark size={14} className="mt-1 shrink-0 opacity-70" />
            ) : (
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${CATEGORY_DOT[n.category]}`} />
            )}
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${n.read ? "text-ink-muted" : "font-medium text-ink"}`}>{n.title}</p>
              <p className="mt-0.5 text-xs text-ink-soft">{formatDate(new Date(n.timestamp), "long")}</p>
            </div>
            {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-forest-400" />}
          </Link>
          );
        })}
      </div>
    </div>
  );
}
