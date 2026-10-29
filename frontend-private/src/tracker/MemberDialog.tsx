import { useEffect, useState, type FormEvent } from 'react';
import { Dialog } from '../Dialog';
import type { Member, MemberRole, SlackUser } from '../types';
import { errorText, ROLE_LABELS, ROLES, tracker, useTracker } from './api';

interface Props {
  open: boolean;
  onClose: () => void;
  member: Member | null;
  /** Starting values for a new member (the viewer adding themselves). */
  prefill?: { github_login: string; name: string } | null;
  onSaved: () => void;
}

export function MemberDialog({ open, onClose, member, prefill, onSaved }: Props) {
  const { config } = useTracker();
  const [login, setLogin] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<MemberRole>('other');
  const [slack, setSlack] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null until loaded; empty when Slack isn't set up (then the id is typed in).
  const [slackUsers, setSlackUsers] = useState<SlackUser[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setLogin(member?.github_login ?? prefill?.github_login ?? '');
    setName(member?.name ?? prefill?.name ?? '');
    setRole(member?.role ?? 'other');
    setSlack(member?.slack_user_id ?? '');
    setActive(member?.active ?? true);
    setError(null);
    if (slackUsers) return;
    tracker
      .slackUsers()
      .then(setSlackUsers)
      .catch(() => setSlackUsers([]));
  }, [open, member]);

  // An unlinked member whose name matches exactly one Slack account starts on it.
  useEffect(() => {
    if (!open || !slackUsers || member?.slack_user_id) return;
    const full = (member?.name ?? prefill?.name ?? '').trim().toLowerCase();
    const matches = full ? slackUsers.filter((u) => u.name.trim().toLowerCase() === full) : [];
    if (matches.length === 1) setSlack(matches[0].id);
  }, [open, slackUsers, member]);
  const slackKnown = !slack || slackUsers?.some((u) => u.id === slack);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = { github_login: login.trim(), name: name.trim(), role, slack_user_id: slack.trim() || null };
    try {
      if (member) await tracker.updateMember(member.id, config.me.is_admin ? { ...body, active } : body);
      else await tracker.addMember({ ...body, active: true });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={member ? 'Edit member' : 'Add team member'}
      subtitle={member?.source === 'github' ? 'Added from the GitHub organization.' : 'Everyone in the GitHub organization is added at the next sync.'}
      footer={
        <>
          <span />
          <div className="button-row">
            <button type="button" className="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form="member-form" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      }
    >
      <form id="member-form" onSubmit={(e) => void submit(e)}>
        <div className="form-row">
          <div className="field">
            <label htmlFor="m-login">GitHub username</label>
            <input id="m-login" value={login} onChange={(e) => setLogin(e.target.value)} required placeholder="octocat" />
          </div>
          <div className="field">
            <label htmlFor="m-name">Name</label>
            <input id="m-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="m-role">Role</label>
            <select id="m-role" value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="m-slack">Slack account</label>
            {slackUsers && slackUsers.length > 0 ? (
              <select id="m-slack" value={slack} onChange={(e) => setSlack(e.target.value)}>
                <option value="">Not linked</option>
                {!slackKnown && <option value={slack}>{slack}</option>}
                {slackUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            ) : (
              <input id="m-slack" value={slack} onChange={(e) => setSlack(e.target.value)} placeholder="Member ID, U0123ABCD (optional)" />
            )}
          </div>
        </div>
        <p className="muted small">
          With a Slack account linked, they get a Slack DM when someone else assigns them a task or subtask, and the weekly posts mention them and remind them to post updates.
        </p>
        {member && config.me.is_admin && (
          <label className="checkbox">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active (inactive members leave the board but keep their history)
          </label>
        )}
        {error && <p className="error">{error}</p>}
      </form>
    </Dialog>
  );
}
