"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Download, Eye, EyeOff, Paperclip, Trash2, Upload } from "lucide-react";
import { BrandSpinner } from "@/components/brand/brand-loader";
import { Button } from "@/components/ui/button";
import { Field, FIELD } from "@/components/ui/field";
import {
  removeProjectFile,
  setFileVisibility,
  uploadProjectFile,
} from "@/lib/actions/files";
import { idleState } from "@/lib/actions/state";
import { cn, formatDate } from "@/lib/utils";

export interface ProjectFile {
  id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  category: string;
  is_client_visible: boolean;
  created_at: string;
  uploaded_by_name: string | null;
}

/** Bytes as a person reads them. */
function asSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Everything attached to a project.
 *
 * **Whether the client can see it is shown on every row, and is one click to
 * change.** That is the only property of a file anybody edits after uploading,
 * and it is almost always edited immediately — because somebody has just
 * realised it is wrong. Burying it in a form would mean the wrong answer stays.
 *
 * Nothing here links straight to storage. Every download goes through
 * `/api/files/[id]`, which asks the database — as the person clicking — whether
 * they may have it, and only then signs a URL that lives for a minute.
 */
export function ProjectFiles({
  projectId,
  files,
}: {
  projectId: string;
  files: ProjectFile[];
}) {
  const [state, action, pending] = useActionState(uploadProjectFile, idleState);
  const form = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state.status === "success") form.current?.reset();
  }, [state]);

  const shared = files.filter((file) => file.is_client_visible).length;

  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Paperclip className="size-4" aria-hidden />
          Files
          {files.length > 0 && (
            <span className="font-mono text-xs font-normal text-text-subtle">
              {files.length} · {shared} shared
            </span>
          )}
        </h2>

        {!open && (
          <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
            <Upload className="size-4" aria-hidden />
            Add a file
          </Button>
        )}
      </div>

      {files.length === 0 ? (
        <p className="measure mt-4 text-sm leading-relaxed text-text-muted">
          Nothing attached yet. The contract, the designs, anything the client
          needs to read — and anything internal, which they will not see.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {files.map((file) => (
            <li key={file.id} className="flex flex-wrap items-center gap-3 py-3">
              <a
                href={`/api/files/${file.id}`}
                className="group flex min-w-0 flex-1 items-center gap-2"
              >
                <Download
                  className="size-4 shrink-0 text-text-subtle group-hover:text-accent"
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium group-hover:text-accent">
                    {file.filename}
                  </span>
                  <span className="block truncate text-xs text-text-subtle">
                    {file.category}
                    {file.size_bytes ? ` · ${asSize(file.size_bytes)}` : ""}
                    {file.uploaded_by_name ? ` · ${file.uploaded_by_name}` : ""} ·{" "}
                    {formatDate(file.created_at)}
                  </span>
                </span>
              </a>

              <Visibility fileId={file.id} visible={file.is_client_visible} />
              <RemoveFile fileId={file.id} name={file.filename} />
            </li>
          ))}
        </ul>
      )}

      {open && (
        <form
          ref={form}
          action={action}
          className="mt-6 space-y-4 border-t border-border pt-6"
        >
          <input type="hidden" name="project_id" value={projectId} />

          <Field label="File" required hint="Up to 25 MB. Anything bigger goes by email or a link.">
            {(id, describedBy) => (
              <input
                id={id}
                name="file"
                type="file"
                required
                aria-describedby={describedBy}
                className={cn(FIELD, "file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-3 file:py-1 file:text-sm")}
              />
            )}
          </Field>

          <Field label="What it is">
            {(id) => (
              <select id={id} name="category" defaultValue="document" className={cn(FIELD, "sm:w-56")}>
                <option value="document">Document — a contract, a brief, a note</option>
                <option value="design">Design</option>
                <option value="deliverable">Deliverable — something being handed over</option>
                <option value="reference">Reference — something they sent us</option>
              </select>
            )}
          </Field>

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="is_client_visible"
              defaultChecked
              className="mt-0.5 size-4 rounded border-border-strong text-accent focus:ring-2 focus:ring-accent/20"
            />
            <span>
              <span className="font-medium">The client can see this</span>
              <span className="block text-text-subtle">
                Untick for notes, exports and anything half-finished. It can be
                changed afterwards in one click.
              </span>
            </span>
          </label>

          {state.status !== "idle" && state.message ? (
            <p
              role={state.status === "error" ? "alert" : "status"}
              className={cn(
                "measure text-sm",
                state.status === "error" ? "text-danger" : "text-success",
              )}
            >
              {state.message}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? <BrandSpinner /> : <Upload className="size-4" aria-hidden />}
              {pending ? "Uploading" : "Upload it"}
            </Button>
            <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

function Visibility({ fileId, visible }: { fileId: string; visible: boolean }) {
  const [state, action, pending] = useActionState(setFileVisibility, idleState);

  return (
    <form action={action}>
      <input type="hidden" name="file_id" value={fileId} />
      <input type="hidden" name="visible" value={String(!visible)} />
      <button
        type="submit"
        disabled={pending}
        title={visible ? "The client can see this. Click to hide it." : "Internal. Click to share it."}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50",
          visible
            ? "bg-accent-soft text-accent hover:bg-accent-soft/70"
            : "bg-surface-2 text-text-muted hover:text-text",
        )}
      >
        {visible ? <Eye className="size-3.5" aria-hidden /> : <EyeOff className="size-3.5" aria-hidden />}
        {visible ? "Shared" : "Internal"}
      </button>
      {state.status === "error" && state.message && (
        <span role="alert" className="ml-2 text-xs text-danger">
          {state.message}
        </span>
      )}
    </form>
  );
}

function RemoveFile({ fileId, name }: { fileId: string; name: string }) {
  const [state, action, pending] = useActionState(removeProjectFile, idleState);

  return (
    <form action={action}>
      <input type="hidden" name="file_id" value={fileId} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`Remove ${name}`}
        className="rounded-lg p-2 text-text-subtle transition-colors hover:bg-surface-2 hover:text-danger disabled:opacity-50"
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
      {state.status === "error" && state.message && (
        <span role="alert" className="ml-2 text-xs text-danger">
          {state.message}
        </span>
      )}
    </form>
  );
}
