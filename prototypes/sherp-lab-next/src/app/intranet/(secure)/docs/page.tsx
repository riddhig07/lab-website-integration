import Link from "next/link";
import { DocKnowledgeBase } from "@/components/DocKnowledgeBase";

export const metadata = { title: "Docs & SOPs" };

export default function IntranetDocsPage() {
  return (
    <>
      <h1 className="font-display text-3xl font-bold text-white">Document storage & knowledge base</h1>
      <p className="mt-3 max-w-2xl text-zinc-400">
        On-site SOPs and onboarding. For the full Nath Lab folder tree and every Drive file, use{" "}
        <Link href="/intranet/drive" className="text-teal-300 hover:underline">
          Drive
        </Link>
        .
      </p>
      <div className="mt-10">
        <DocKnowledgeBase />
      </div>
    </>
  );
}
