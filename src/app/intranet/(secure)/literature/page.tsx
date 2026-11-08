import { LiteratureWorkbench } from "@/components/LiteratureWorkbench";

export const metadata = { title: "Literature" };

export default function IntranetLiteraturePage() {
  return (
    <>
      <h1 className="font-display text-3xl font-bold text-white">Literature review storage</h1>
      <p className="mt-3 max-w-2xl text-zinc-400">
        Graph of papers, key points, and research questions — parsing engine with citation
        auto-expansion from seed links.
      </p>
      <div className="mt-10">
        <LiteratureWorkbench />
      </div>
    </>
  );
}
