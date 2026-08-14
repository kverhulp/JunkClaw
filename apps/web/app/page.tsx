export default function Home() {
  return (
    <main>
      <h1>JunkClaw</h1>
      <p className="muted">
        Used-car listing triage for Facebook Marketplace. Skeleton — the corpus
        (M0) is the gate, and nothing here pretends to be scoring yet.
      </p>

      <dl className="status">
        <dt>
          <code>POST /api/ingest</code>
        </dt>
        <dd>
          Validates listing facts against the PII boundary. Persistence is M0.
        </dd>

        <dt>
          <code>POST /api/score</code>
        </dt>
        <dd>Returns everything as pending until the corpus can support a number.</dd>

        <dt>
          <code>GET · PUT /api/criteria</code>
        </dt>
        <dd>Saved criteria per user. M1.</dd>

        <dt>
          <code>POST /api/negotiate</code>
        </dt>
        <dd>Suspended-workflow copilot with the code-enforced ceiling. M2.</dd>
      </dl>
    </main>
  );
}
