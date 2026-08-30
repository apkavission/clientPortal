import {
  Building2,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  Kanban,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * The sidebar's icons, by name.
 *
 * A map rather than an import per call site, because `nav.ts` is data — a menu
 * item names its icon as a string so the same list can be read on the server, in
 * the browser, and by the permission form without any of them importing a
 * component.
 *
 * An unknown name falls back rather than throwing. A sidebar with one wrong
 * picture is a cosmetic bug; a sidebar that crashes is the whole panel.
 */
const ICONS: Record<string, LucideIcon> = {
  "layout-dashboard": LayoutDashboard,
  kanban: Kanban,
  building: Building2,
  folder: FolderKanban,
  inbox: Inbox,
  users: Users,
};

export function Icon({ name, className }: { name: string; className?: string }) {
  const Component = ICONS[name] ?? FolderKanban;
  return <Component className={className} aria-hidden />;
}
