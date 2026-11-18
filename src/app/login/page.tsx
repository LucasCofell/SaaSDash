import Link from "next/link";
import { sendMagicLink } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;
  return (
    <main className="wrap" style={{ maxWidth: 460 }}>
      <div className="topbar">
        <Link className="brand" href="/">
          SaaSDash
        </Link>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Sign in</h2>
        {sent ? (
          <p className="success">Check your email for a sign-in link.</p>
        ) : (
          <form action={sendMagicLink} className="row">
            <label className="field" style={{ flex: 1 }}>
              Work email
              <input type="email" name="email" required autoComplete="email" placeholder="you@company.com" />
            </label>
            <button className="btn" type="submit">
              Email me a link
            </button>
          </form>
        )}
        {error && <p className="error small">{error}</p>}
        <p className="muted small">No password needed. New accounts are created automatically.</p>
      </div>
    </main>
  );
}
