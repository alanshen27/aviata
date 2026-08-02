import { SpaApp } from "@/components/spa/SpaApp";
import { getLegs } from "@/lib/store";

export default async function Home() {
  const legs = await getLegs();
  return <SpaApp legs={legs} />;
}
