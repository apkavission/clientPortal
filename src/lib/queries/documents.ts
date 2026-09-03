import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Client documents on a project — invoices, contracts, anything to be signed.
 *
 * ---------------------------------------------------------------------------
 * **The kinds are read, not written down.** `portal.document_types` is master
 * data: adding a purchase order or an NDA is an admin writing a row rather than
 * a migration, and each kind carries its own rules — whether it needs an
 * amount, whether it is normally signed. A list of kinds in this file would be
 * the second list, and the second list is always the stale one.
 *
 * **Only the client-facing kinds appear here.** An offer letter and a salary
 * slip belong to a person, and people are managed in the company admin — the
 * portal's own team screen was removed so there would be one place for that.
 */

export interface ProjectDocument {
  id: string;
  kindKey: string;
  kindLabel: string;
  title: string;
  amount: string | null;
  issuedOn: string;
  needsSignature: boolean;
  hasFile: boolean;
  note: string | null;
  /** Who has signed, so the screen can say what is still outstanding. */
  signedBy: { party: string; name: string; at: string }[];
}

export interface DocumentKindOption {
  key: string;
  label: string;
  needsAmount: boolean;
  signsByDefault: boolean;
}

/** The kinds that can be issued to a client. */
export async function getClientDocumentKinds(): Promise<DocumentKindOption[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("document_types")
    .select("key, label, needs_amount, signs_by_default, belongs_to")
    .eq("is_active", true)
    .in("belongs_to", ["client", "both"])
    .order("sort_order");

  if (error) {
    console.error("[documents] kinds failed:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    key: row.key,
    label: row.label,
    needsAmount: row.needs_amount,
    signsByDefault: row.signs_by_default,
  }));
}

/** What has been issued on one project. */
export async function getProjectDocuments(projectId: string): Promise<ProjectDocument[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("documents")
    .select(
      `id, kind_key, title, amount, issued_on, needs_signature, storage_key, note,
       type:document_types(label),
       signatures:document_signatures(party, signed_name, signed_at)`,
    )
    .eq("project_id", projectId)
    .order("issued_on", { ascending: false });

  if (error) {
    console.error("[documents] project documents failed:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const document = row as unknown as {
      id: string;
      kind_key: string;
      title: string;
      amount: string | null;
      issued_on: string;
      needs_signature: boolean;
      storage_key: string | null;
      note: string | null;
      type: { label: string } | { label: string }[] | null;
      signatures: { party: string; signed_name: string; signed_at: string }[];
    };

    const type = Array.isArray(document.type) ? document.type[0] : document.type;

    return {
      id: document.id,
      kindKey: document.kind_key,
      /* The key rather than an invented word, if that kind has since gone.
         "invoice" is ugly and true; "Document" would be neither. */
      kindLabel: type?.label ?? document.kind_key,
      title: document.title,
      amount: document.amount,
      issuedOn: document.issued_on,
      needsSignature: document.needs_signature,
      hasFile: document.storage_key !== null,
      note: document.note,
      signedBy: (document.signatures ?? []).map((signature) => ({
        party: signature.party,
        name: signature.signed_name,
        at: signature.signed_at,
      })),
    };
  });
}
