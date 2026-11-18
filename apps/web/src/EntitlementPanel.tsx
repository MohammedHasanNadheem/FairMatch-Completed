import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

type EntitlementState = {
  planCode: string;
  planName: string;
  status: string;
  trialEndsAt?: string | null;
  periodEndsAt?: string | null;
  entitlements: Record<string, string | number | boolean>;
};

const entitlementLabels: Record<string, string> = {
  members: "Team members",
  publishedOpportunities: "Published opportunities",
  aiRequestsMonthly: "AI requests / month",
  assessmentsMonthly: "Assessments / month",
  savedSearches: "Saved searches",
  auditRetentionDays: "Audit retention (days)",
  reports: "Exportable reports",
  ssoReady: "Enterprise SSO readiness",
};

export function EntitlementPanel() {
  const [plan, setPlan] = useState<EntitlementState | null>(null);
  const [message, setMessage] = useState("Loading plan controls…");
  useEffect(() => {
    if (!supabase) return;
    supabase
      .rpc("current_organisation_entitlements")
      .then(({ data, error }) => {
        if (error) {
          setMessage(
            error.code === "PGRST202"
              ? "Apply migration 016 to activate SaaS plan controls."
              : error.message,
          );
          return;
        }
        setPlan(data as EntitlementState);
        setMessage("");
      });
  }, []);

  return (
    <section className="entitlement-panel">
      <header>
        <div>
          <p className="small-label">COMMERCIAL ACCESS</p>
          <h3>{plan?.planName ?? "Plan and usage controls"}</h3>
        </div>
        {plan && (
          <span className={`subscription-${plan.status}`}>
            {plan.status.replace(/_/g, " ")}
          </span>
        )}
      </header>
      {message && <p>{message}</p>}
      {plan && (
        <>
          <div className="entitlement-grid">
            {Object.entries(plan.entitlements).map(([key, value]) => (
              <article key={key}>
                <span>
                  {entitlementLabels[key] ?? key.replace(/([A-Z])/g, " $1")}
                </span>
                <strong>
                  {typeof value === "boolean"
                    ? value
                      ? "Included"
                      : "Not included"
                    : value.toLocaleString()}
                </strong>
              </article>
            ))}
          </div>
          <footer>
            <span>
              {plan.trialEndsAt
                ? `Trial ends ${new Date(plan.trialEndsAt).toLocaleDateString()}`
                : plan.periodEndsAt
                  ? `Current period ends ${new Date(plan.periodEndsAt).toLocaleDateString()}`
                  : "Access is currently active"}
            </span>
            <small>
              Billing-provider records are server-side. Pricing remains unset
              until commercial terms and tax handling are approved.
            </small>
          </footer>
        </>
      )}
    </section>
  );
}
