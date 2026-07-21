import { PageError } from "@/components/PageError";
import { dateTime } from "@/lib/format";
import { requireApi } from "@/lib/session";
import { FeedbackForm } from "./FeedbackForm";

export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const client = await requireApi();
  let recent;
  try {
    recent = (await client.listBetaFeedback()).feedback;
  } catch (error) {
    return <PageError error={error} />;
  }
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Beta feedback</h1>
          <p>Tell us where setup or evidence stopped making sense. Submission is explicit and project-scoped.</p>
        </div>
      </div>

      <div className="alert warn" style={{ marginBottom: 14 }}>
        Do not paste project/provider keys, customer prompts, private outputs or personal data. Model names,
        redacted status codes and timestamps are useful. Blindspot does not attach logs automatically.
      </div>

      <FeedbackForm />

      <h2 style={{ margin: "26px 0 14px", fontSize: 16 }}>Your recent submissions</h2>
      {recent.length === 0 ? (
        <div className="card muted small">No feedback submitted from this project yet.</div>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>When</th><th>Stage</th><th>Impact</th><th>What happened</th></tr></thead>
            <tbody>
              {recent.map((item) => (
                <tr key={item.id}>
                  <td>{dateTime(item.createdAt)}</td>
                  <td>{item.stage.replaceAll("_", " ")}</td>
                  <td>{item.impact}</td>
                  <td style={{ maxWidth: 520 }}>{item.actual}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
