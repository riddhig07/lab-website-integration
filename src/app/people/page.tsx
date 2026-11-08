import { PublicShell } from "@/components/PublicShell";
import { PeopleDirectory } from "@/components/people/PeopleDirectory";

export const metadata = { title: "People" };

export default function PeoplePage() {
  return (
    <PublicShell>
      <main className="mx-auto max-w-6xl px-6 py-12 sm:px-8 sm:py-16">
        <h1 className="font-display text-4xl font-bold text-white">People</h1>
        <p className="mt-4 max-w-2xl text-zinc-400">
          Current lab members — click a card for biography, interests, and links.
        </p>
        <div className="mt-12">
          <PeopleDirectory />
        </div>
      </main>
    </PublicShell>
  );
}
