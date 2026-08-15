import { SiteFooter, SiteHeader } from "../components/layout/site-chrome";
import { Hero } from "../components/home/sections";
import { RoadScene } from "../components/home/road-scene";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
      </main>
      {/* Full-bleed, between the hero and the footer, as in the mockup. */}
      <RoadScene />
      <SiteFooter flush />
    </>
  );
}
