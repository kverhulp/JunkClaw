import { Suspense } from "react";

import { CatalogueView } from "../../components/catalogue/catalogue-view";
import { CarCardGridSkeleton } from "../../components/catalogue/car-card";

export const metadata = { title: "Listings — AutoScout" };

/**
 * useSearchParams needs a Suspense boundary, or the whole route opts out of
 * static rendering. The fallback is the same skeleton the grid uses, so the
 * boundary is invisible.
 */
export default function CataloguePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-6 py-10">
          <CarCardGridSkeleton count={6} />
        </div>
      }
    >
      <CatalogueView />
    </Suspense>
  );
}
