import { Shell } from "@/components/admin/shell";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { requireStaff } from "@/lib/auth/session";
import { navFor, roleLabel } from "@/lib/auth/menu";

/**
 * Everything in this group is the company's own panel.
 *
 * The guard is here so a screen added later cannot be added without it. Each
 * page still calls `requireMenu()` for its own key — this one only answers "are
 * you staff at all", and the per-screen permission is a different question.
 */
export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireStaff();

  return (
    <ConfirmProvider>
      <Shell
        groups={navFor(session.staff)}
        who={session.staff.full_name}
        role={roleLabel(session.staff.role_key)}
      >
        {children}
      </Shell>
    </ConfirmProvider>
  );
}
