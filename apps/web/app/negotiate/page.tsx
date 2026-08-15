import { SiteFooter, SiteHeader } from "../../components/layout/site-chrome";
import { NegotiateView } from "../../components/negotiate/negotiate-view";

export const metadata = { title: "Negotiate — AutoScout" };

export default function NegotiatePage() {
  return (
    <>
      <SiteHeader />
      <main className="bg-neutral-200">
        <NegotiateView />
      </main>
      <SiteFooter />
    </>
  );
}
