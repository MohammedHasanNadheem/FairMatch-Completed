import { FormEvent, useEffect, useState } from 'react';
import { supabase } from './lib/supabase';

export function ProfileEditor({ onClose }: { onClose: () => void }) {
  const [headline, setHeadline] = useState('');
  const [location, setLocation] = useState('');
  const [skills, setSkills] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [stage, setStage] = useState<'school' | 'college' | 'experienced'>('college');
  const [message, setMessage] = useState('Loading profile…');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const client = supabase;
    if (!client) { setMessage('Supabase is not configured.'); return; }
    client.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const [{ data: profile, error }, { data: account }] = await Promise.all([
        client.from('career_profiles').select('headline, location, skills, profile_visibility, stage').eq('profile_id', data.user.id).maybeSingle(),
        client.from('profiles').select('role').eq('id', data.user.id).maybeSingle(),
      ]);
      if (error) { setMessage(error.message); return; }
      const inferredStage = account?.role === 'school_student' ? 'school' : account?.role === 'college_student' ? 'college' : 'experienced';
      setHeadline(profile?.headline ?? ''); setLocation(profile?.location ?? ''); setSkills((profile?.skills ?? []).join(', ')); setVisibility(profile?.profile_visibility ?? 'private'); setStage(profile?.stage ?? inferredStage); setMessage('');
    });
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setSaving(true);
    const { data } = await supabase.auth.getUser();
    if (!data.user) { setSaving(false); setMessage('Please sign in again.'); return; }
    const skillList = skills.split(',').map((value) => value.trim()).filter(Boolean).slice(0, 30);
    const { error } = await supabase.from('career_profiles').upsert({ profile_id: data.user.id, stage, headline: headline || null, location: location || null, skills: skillList, profile_visibility: visibility, updated_at: new Date().toISOString() });
    setSaving(false); setMessage(error ? error.message : 'Profile saved. Your visibility setting is applied immediately.');
  }

  return <div className="modal-backdrop"><section className="auth-dialog profile-editor" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title"><button className="close" onClick={onClose} aria-label="Close">×</button><p className="eyebrow">CANDIDATE PROFILE</p><h2 id="profile-editor-title">Build a profile you control.</h2><p className="auth-copy">Use verified, accurate information. Private is the default; recruiter visibility is a deliberate choice.</p><form onSubmit={save}><label>Career headline<input value={headline} maxLength={180} onChange={(event) => setHeadline(event.target.value)} placeholder="e.g. Mechanical engineering student seeking internships" /></label><label>Preferred location<input value={location} maxLength={120} onChange={(event) => setLocation(event.target.value)} /></label><label>Skills (separate with commas)<input value={skills} maxLength={800} onChange={(event) => setSkills(event.target.value)} placeholder="Java, CAD, Excel" /></label><label>Profile visibility<select value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="private">Private — shown only when you apply</option><option value="shared_with_organisations">Shared with your approved organisations</option><option value="recruiter_searchable">Recruiter searchable</option></select></label>{message && <p className="form-message" role="status">{message}</p>}<button className="submit-auth" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button></form></section></div>;
}
