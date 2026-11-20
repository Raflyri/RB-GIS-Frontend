import { LEGAL_STATUS_META, VERIFICATION_META } from "@/lib/thematic";
import type { LegalStatus, VerificationStatus } from "@/lib/types";

export function LegalStatusBadge({ status }: { status: LegalStatus }) {
  const meta = LEGAL_STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.badgeClass}`}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  );
}

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const meta = VERIFICATION_META[status];
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}
