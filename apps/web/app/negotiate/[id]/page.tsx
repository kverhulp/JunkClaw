import { notFound } from "next/navigation";

import { SiteFooter, SiteHeader } from "../../../components/layout/site-chrome";
import { NegotiateView } from "../../../components/negotiate/negotiate-view";
import { listingById, MOCK_LISTINGS } from "../../../mocks/vehicles";

export function generateStaticParams() {
  return MOCK_LISTINGS.map((listing) => ({ id: listing.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listing = listingById(id);
  return { title: listing ? `Negotiate ${listing.rawTitle} — AutoScout` : "Negotiate — AutoScout" };
}

export default async function NegotiateListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = listingById(id);
  if (!listing) notFound();

  return (
    <>
      <SiteHeader />
      <main className="bg-neutral-200">
        <NegotiateView listing={listing} />
      </main>
      <SiteFooter />
    </>
  );
}
