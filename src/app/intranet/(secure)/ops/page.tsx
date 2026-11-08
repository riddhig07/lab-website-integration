import { LabOpsPanel } from "@/components/LabOpsPanel";

export const metadata = { title: "Lab ops" };

export default function IntranetOpsPage() {
  return (
    <>
      <h1 className="font-display text-3xl font-bold text-white">Lab operations</h1>
      <p className="mt-3 max-w-2xl text-zinc-400">
        Equipment reservation schedules, inventory tracking, and maintenance logs.
      </p>
      <div className="mt-10">
        <LabOpsPanel />
      </div>
    </>
  );
}
