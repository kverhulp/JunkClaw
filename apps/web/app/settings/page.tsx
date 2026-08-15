"use client";

import { useState } from "react";

import { AppShell } from "../../components/layout/app-shell";
import { Badge, Button, Card, CardBody, CardHeader, Input } from "../../components/ui/primitives";
import { Tabs } from "../../components/ui/interactive";
import { SUPPLIER } from "../../mocks/vehicles";

type TabId = "profile" | "suppliers" | "system";

export default function SettingsPage() {
  const [tab, setTab] = useState<TabId>("profile");
  const [saved, setSaved] = useState(false);

  function save() {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  return (
    <AppShell title="Settings" description="Account, supplier preferences, and system configuration.">
      <Tabs
        ariaLabel="Settings sections"
        activeId={tab}
        onSelect={(id) => setTab(id as TabId)}
        items={[
          { id: "profile", label: "Profile" },
          { id: "suppliers", label: "Supplier preferences" },
          { id: "system", label: "System" },
        ]}
      />

      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        tabIndex={-1}
        className="max-w-2xl pt-6"
      >
        {tab === "profile" ? <ProfilePanel /> : null}
        {tab === "suppliers" ? <SuppliersPanel /> : null}
        {tab === "system" ? <SystemPanel /> : null}

        <div className="mt-6 flex items-center gap-3 border-t border-divider pt-5">
          <Button variant="primary" onClick={save}>
            Save changes
          </Button>
          {/* Announced politely so a save is confirmed without stealing focus. */}
          <span aria-live="polite" className="text-[13px] text-accent-700">
            {saved ? "Saved" : ""}
          </span>
        </div>
      </div>
    </AppShell>
  );
}

function ProfilePanel() {
  return (
    <div className="flex flex-col gap-5">
      <Input label="Display name" name="displayName" defaultValue="Wanhar" />
      <Input
        label="Email"
        name="email"
        type="email"
        defaultValue="you@example.com"
        hint="Used for price-drop alerts. We never post or message on your behalf."
      />
      <Input
        label="Home city"
        name="city"
        defaultValue="Charlottetown"
        hint="Sets the centre of the search radius."
      />
      <Input
        label="Search radius (km)"
        name="radius"
        type="number"
        defaultValue={250}
        hint="Maritime listings are thin — a wider radius produces better comparables."
      />
    </div>
  );
}

function SuppliersPanel() {
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <span className="text-[15px] font-extrabold">{SUPPLIER.label}</span>
          <Badge tone="positive">Collecting</Badge>
        </CardHeader>
        <CardBody>
          <p className="text-[14px] text-text-secondary">
            Collected by the browser extension as you browse. Nothing is fetched in the background.
          </p>
        </CardBody>
      </Card>

      {/* No toggle: one source, always on. A switch that cannot be switched off
          without emptying the product is decoration pretending to be a setting. */}
      <p className="text-[14px] text-text-secondary">
        Facebook Marketplace is the only source. Other marketplaces would need a server-side
        collector rather than the extension, which is a different decision from the one this
        product has made — so they are out of scope rather than pending.
      </p>
    </div>
  );
}

function SystemPanel() {
  return (
    <div className="flex flex-col gap-5">
      <Input
        label="API endpoint"
        name="apiUrl"
        defaultValue="http://localhost:3000"
        hint="Where the extension posts listing facts."
      />

      <Card>
        <CardHeader>
          <span className="text-[15px] font-medium">Background collection</span>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <p className="text-[14px] text-text-secondary">
            AutoScout only reads pages you open yourself. It never fetches Marketplace in the
            background.
          </p>
          {/* Stated as a product commitment, not a toggle — the account at risk
              from automated fetching is the user's, not ours. */}
          <p className="text-[14px] text-text-secondary">
            Automated background polling would put your Facebook account at risk of enforcement,
            so it is off by design rather than off by default.
          </p>
          <Badge tone="positive" className="self-start">
            No background requests
          </Badge>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <span className="text-[15px] font-medium">What we store</span>
        </CardHeader>
        <CardBody>
          <p className="text-[14px] text-text-secondary">
            Market facts only: make, model, year, price, mileage, coarse location, and listing
            dates. Never seller names, profile links, photos of people, or message contents.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
