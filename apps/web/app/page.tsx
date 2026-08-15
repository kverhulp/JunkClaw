import { SiteFooter, SiteHeader } from "../components/layout/site-chrome";
import { Hero } from "../components/home/sections";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
      </main>
      <SiteFooter />
    </>
  );
}
