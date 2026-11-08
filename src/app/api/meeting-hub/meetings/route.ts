import { NextResponse } from "next/server";
import { getMeetings } from "@/lib/meeting-hub/store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  const type = searchParams.get("type");
  const project = searchParams.get("project");
  let meetings = await getMeetings();
  if (month) meetings = meetings.filter((m) => m.dateKey.startsWith(month));
  if (type === "monday" || type === "thursday") {
    meetings = meetings.filter((m) => m.type === type);
  }
  if (project) {
    meetings = meetings.filter((m) =>
      m.relatedProjects.some((p) => p.toLowerCase().includes(project.toLowerCase())),
    );
  }
  return NextResponse.json({ meetings });
}
