import Link from "next/link";
import { ApiError } from "@/lib/api";
export function PageError({ error }: { error: unknown }) {
  const auth = error instanceof ApiError && error.status === 401;
  return <div className="card alert danger" role="alert"><span>{auth ? "Your session has expired. Sign in to continue." : "This view could not be loaded. Reload the page to try again."}</span>{auth && <Link className="btn" href="/login">Sign in</Link>}</div>;
}
