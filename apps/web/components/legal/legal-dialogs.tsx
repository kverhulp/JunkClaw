"use client";

import type { ReactNode } from "react";

import { Button } from "../ui/primitives";
import { Modal } from "../ui/interactive";

/**
 * Terms and Privacy, as dialogs rather than routes.
 *
 * The content is deliberately specific rather than boilerplate: every claim
 * here is one the codebase actually keeps, and each is checkable against a
 * file. Generic legal text that describes a different product is worse than
 * none, because it is the document someone reads when they want to know what
 * we do with their data.
 *
 * These are not a substitute for review by someone qualified before launch.
 */

export type LegalDoc = "terms" | "privacy" | null;

const UPDATED = "14 August 2026";

export function LegalDialogs({ open, onClose }: { open: LegalDoc; onClose: () => void }) {
  return (
    <>
      <Modal
        open={open === "terms"}
        onClose={onClose}
        title="Terms of service"
        footer={
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        }
      >
        <Doc updated={UPDATED}>
          <Section title="What AutoScout is">
            An information tool. It compares used-car listings against what similar cars are
            being asked for nearby, flags things in the description worth checking, and prepares
            questions for you to ask a seller. It is not a broker, a dealer, or an adviser, and
            it takes no part in any transaction.
          </Section>

          <Section title="Prices are asking prices">
            Every figure shown is what a seller is asking, not what a car sold for. A car priced
            below comparable asking prices is not necessarily a good deal, and one above them is
            not necessarily a bad one. Where there is not enough local data to make a comparison,
            AutoScout says so rather than estimating.
          </Section>

          <Section title="AutoScout contacts nobody">
            It writes no messages and sends none. What it produces is a list of questions and the
            facts behind them, for you to use however you like. It never contacts a seller on your
            behalf, never names a price for you to offer, never commits you to a purchase, and
            never arranges payment.
          </Section>

          <Section title="How listings are read">
            The browser extension reads Marketplace pages you open yourself, in your own logged-in
            session. It does not fetch anything in the background, and it is not a scraper running
            on our servers. Your use of Facebook remains subject to Facebook&rsquo;s own terms, and
            those are between you and them.
          </Section>

          <Section title="No warranty">
            Estimates are produced from incomplete public data and can be wrong. Inspect any
            vehicle, verify its history, and take mechanical advice before buying. AutoScout is
            provided as-is, and we accept no liability for a purchase decision.
          </Section>
        </Doc>
      </Modal>

      <Modal
        open={open === "privacy"}
        onClose={onClose}
        title="Privacy policy"
        footer={
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        }
      >
        <Doc updated={UPDATED}>
          <Section title="What we store">
            Market facts about vehicles: make, model, year, price, mileage, coarse location,
            listing dates, and the seller-written description of the car. Nothing else about a
            listing reaches our servers.
          </Section>

          <Section title="What we never store">
            Seller names, profile links, profile photos, and message contents. The boundary is
            enforced at the point of transmission by an allowlist, not by a policy someone has to
            remember: a field the extension does not explicitly permit cannot be sent, including
            fields Facebook adds in future.
          </Section>

          <Section title="Sellers are pseudonymous">
            To recognise that the same seller posted several cars, the extension hashes the
            seller&rsquo;s identifier in your browser and sends only the hash. We never hold the
            identifier itself. The salt ships in the extension, so treat this as strong
            obfuscation rather than a cryptographic guarantee.
          </Section>

          <Section title="Nothing runs in the background">
            The extension reads only pages you open. It schedules no recurring work and makes no
            requests you did not trigger by browsing — which also means it cannot put your Facebook
            account at risk of automated-activity enforcement.
          </Section>

          <Section title="Where data lives">
            In Canada, on Postgres hosted in the ca-central-1 region.
          </Section>

          <Section title="Your account">
            Your email is used for sign-in and for alerts you ask for. Ask us and we will delete
            your account and everything attached to it. Vehicle listing facts are not personal
            information and are retained as market history.
          </Section>
        </Doc>
      </Modal>
    </>
  );
}

function Doc({ updated, children }: { updated: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[12px] text-text-muted">Last updated {updated}</p>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h6 className="mb-1.5">{title}</h6>
      <p className="m-0 leading-relaxed text-text-secondary">{children}</p>
    </section>
  );
}
