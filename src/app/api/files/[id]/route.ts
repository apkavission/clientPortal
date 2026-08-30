import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * The one door files come out of.
 *
 * **The bucket is private and nothing is served from it directly.** So every
 * download is two steps, and the order is the whole point:
 *
 *   1. Ask the database, **as the person asking**, for the file's row. The
 *      policies on `project_files` decide — a client gets it only if it is their
 *      project and it is marked visible to them. A row that does not come back
 *      is a row they may not have, and the answer is 404.
 *   2. Only then, with the service role, mint a signed URL that lasts a minute
 *      and redirect to it.
 *
 * Written as one route rather than in each screen because it is a permission
 * decision, and a permission decision copied into three places is two places
 * that will eventually disagree.
 *
 * **404 for "not yours", never 403.** A 403 confirms the file exists, which is
 * information somebody probing does not otherwise have.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return new NextResponse("Not found", { status: 404 });

  const { data: file } = await supabase
    .from("project_files")
    .select("storage_key, filename")
    .eq("id", id)
    .maybeSingle();

  if (!file) return new NextResponse("Not found", { status: 404 });

  const admin = createAdminClient();

  /*
    Sixty seconds, and a download name.

    Long enough for a browser to follow the redirect and start the transfer;
    short enough that a URL copied out of a history or a chat is dead by the time
    anybody else opens it. The link is the grant here, so its lifetime is the
    grant's lifetime.
  */
  const { data: signed, error } = await admin.storage
    .from("project-files")
    .createSignedUrl(file.storage_key, 60, { download: file.filename });

  if (error || !signed) {
    console.error("[files] could not sign the url:", error?.message);
    return new NextResponse("That file could not be opened.", { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
