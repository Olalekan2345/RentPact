import { formatDate } from "@/lib/format";

/**
 * WhatsApp-style delivery/read ticks for a message you sent:
 *   ✓   grey single  — sent (server has it; recipient's app hasn't fetched it)
 *   ✓✓  grey double  — delivered (recipient's app has it, thread not opened)
 *   ✓✓  blue double  — seen (recipient opened the thread)
 * Read implies delivered, so a read message always shows the double tick.
 */
export function MessageTicks({ readAt, deliveredAt }: { readAt: number | null; deliveredAt: number | null }) {
  const read = readAt != null;
  const doubled = read || deliveredAt != null;
  const label = read ? `Seen ${formatDate(new Date(readAt), "long")}` : doubled ? "Delivered" : "Sent";

  return (
    <span title={label} aria-label={label} className={read ? "text-[#0ea5e9]" : "text-ink-soft"}>
      <svg
        viewBox="0 0 18 14"
        className="inline-block h-3 w-[18px] align-middle"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {doubled ? (
          <>
            <path d="M1 7.5l2.8 3L9 4.5" />
            <path d="M7 7.5l2.8 3L15 4.5" />
          </>
        ) : (
          <path d="M4 7.5l2.8 3L12 4.5" />
        )}
      </svg>
    </span>
  );
}
