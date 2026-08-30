import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ClientRequestRow, RequestMessageRow } from "@/types/database";

/**
 * One client request, with everything needed to answer it.
 *
 * The conversation, the project it is against, and where that project stands —
 * because the decision on this screen depends on all three. "Approve as one of
 * the agreed changes" is only a sensible offer if the project has been delivered
 * and there are changes left, and an admin should be able to see both without
 * opening another tab.
 */

export interface RequestThread {
  request: ClientRequestRow;
  project: {
    id: string;
    name: string;
    slug: string;
    change_limit: number;
    change_terms: string | null;
    scope_delivered_at: string | null;
  };
  client: string | null;
  messages: RequestMessageRow[];
  /** Change rounds already used on this project. */
  changesUsed: number;
  /** Who is still unfinished, which is why it is not delivered. */
  unfinished: string[];
}

export async function getRequestThread(id: string): Promise<RequestThread | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("client_requests")
    .select(
      "*, project:client_projects(id, name, slug, change_limit, change_terms, scope_delivered_at), client_user:client_users(full_name)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) console.error("[requests] thread failed:", error.message);
  if (!data) return null;

  const request = data as unknown as ClientRequestRow & {
    project: RequestThread["project"];
    client_user: { full_name: string } | null;
  };

  const [messagesResult, changesResult, membersResult] = await Promise.all([
    supabase
      .from("request_messages")
      .select("*")
      .eq("request_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("client_requests")
      .select("id", { count: "exact", head: true })
      .eq("project_id", request.project.id)
      .not("change_number", "is", null),
    supabase
      .from("project_members")
      .select("completed_at, staff:staff(full_name)")
      .eq("project_id", request.project.id)
      .is("completed_at", null),
  ]);

  if (messagesResult.error)
    console.error("[requests] messages failed:", messagesResult.error.message);

  const unfinished = ((membersResult.data ?? []) as unknown as {
    staff: { full_name: string } | null;
  }[]).map((row) => row.staff?.full_name ?? "Someone");

  return {
    request,
    project: request.project,
    client: request.client_user?.full_name ?? null,
    messages: (messagesResult.data ?? []) as RequestMessageRow[],
    changesUsed: changesResult.count ?? 0,
    unfinished,
  };
}
