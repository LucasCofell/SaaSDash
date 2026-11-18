import Link from "next/link";

export default function Home() {
  return (
    <main className="wrap">
      <div className="topbar">
        <span className="brand">SaaSDash</span>
        <nav className="nav">
          <Link href="/login">Sign in</Link>
        </nav>
      </div>
      <section className="hero">
        <h1>Board-ready SaaS metrics without a finance team.</h1>
        <p>
          Upload your subscription data or connect Stripe. SaaSDash computes MRR, the net new MRR bridge, GRR and NRR,
          cohort retention, runway and burn multiple, defined the way investors expect.
        </p>
        <Link className="btn" href="/login">
          Get started
        </Link>
      </section>
    </main>
  );
}
