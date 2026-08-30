import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ClientForm } from "@/components/admin/client-form";
import { requireMenu } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Add a client" };

export default async function NewClientPage() {
  await requireMenu("clients");

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link
        href="/clients"
        className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Clients
      </Link>

      <h1 className="mt-4 text-2xl font-semibold">Add a client</h1>
      <p className="measure mt-2 text-sm leading-relaxed text-text-muted">
        Only the contact name is required. Everything else can be filled in when
        you have it — a client added after a phone call with nothing but a
        company name is a normal way to start.
      </p>

      <div className="mt-8">
        <ClientForm />
      </div>
    </div>
  );
}
