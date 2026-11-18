import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';

type Opportunity = { id: string; title: string; type: string; location: string; work_mode: string; skills: string[]; application_deadline: string; organisation_id: string };

export function OpportunityBoard({ signedIn, onSignIn }: { signedIn: boolean; onSignIn: () => void }) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(Boolean(supabase));
  const [applying, setApplying] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.from('opportunities').select('id, title, type, location, work_mode, skills, application_deadline, organisation_id').eq('status', 'published').order('application_deadline', { ascending: true }).then(({ data, error }) => {
      setLoading(false);
      if (error) { setMessage('Opportunities will appear after the database is configured.'); return; }
      setOpportunities((data ?? []) as Opportunity[]);
    });
  }, []);

  async function apply(opportunityId: string) {
    if (!signedIn) { onSignIn(); return; }
    if (!supabase) { setMessage('Supabase is not configured.'); return; }
    setApplying(opportunityId);
    const { error } = await supabase.rpc('submit_candidate_application', { opportunity_id: opportunityId, submitted_cover_note: null });
    setApplying(null);
    setMessage(error ? error.message : 'Application submitted. You can track its status from your candidate portal.');
  }

  return <section className="opportunity-section"><div className="section-heading"><p className="eyebrow">OPPORTUNITIES</p><h2>Internships, placements and jobs—one fair application process.</h2><p>Published opportunities are shared with eligible candidates. Each application is private to the candidate and authorised hiring team.</p></div>
    {message && <p className="opportunity-message">{message}</p>}
    {loading ? <p className="empty-state">Loading opportunities…</p> : opportunities.length ? <div className="opportunity-grid">{opportunities.map((opportunity) => <article key={opportunity.id} className="opportunity-card"><span>{opportunity.type.replace(/_/g, ' ')}</span><h3>{opportunity.title}</h3><p>{opportunity.location} · {opportunity.work_mode.replace(/_/g, ' ')}</p><div>{opportunity.skills.slice(0, 4).map((skill) => <small key={skill}>{skill}</small>)}</div><footer><time>Apply by {new Date(opportunity.application_deadline).toLocaleDateString()}</time><button disabled={applying === opportunity.id} onClick={() => apply(opportunity.id)}>{applying === opportunity.id ? 'Submitting…' : 'Apply'}</button></footer></article>)}</div> : <p className="empty-state">No published opportunities yet. Approved company teams can create and publish them from their portal.</p>}</section>;
}
