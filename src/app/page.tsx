import { SpaApp } from "@/components/spa/SpaApp";
import { getLiveLegs } from "@/lib/listings";

export const dynamic = "force-dynamic";

export default async function Home() {
  const legs = await getLiveLegs();
  return <SpaApp legs={legs} />;
}
