import { useState, useRef, ChangeEvent } from "react";
import { UserProfile } from "../../types";

export function ProfilePage(props: {
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void;
  // Read-only, resolved by the page from the org chart.
  teamLeadName?: string;
  branchManagerName?: string;
}) {
  const profile = props.profile;
  const initials =
    profile.name && profile.name.trim().length > 0
      ? profile.name.trim().charAt(0).toUpperCase()
      : "J";

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [saveNotice, setSaveNotice] = useState("");
  const saveNoticeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  function update(next: Partial<UserProfile>) {
    props.onProfileChange({ ...profile, ...next });
  }

  function handlePhotoSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    update({ headshotUrl: objectUrl });
    
    const formData = new FormData();
    formData.append('file', file);
    
    fetch('/api/upload-image', {
      method: 'POST',
      body: formData,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.url) {
          update({ headshotUrl: data.url });
        }
      })
      .catch((error) => {
        console.error('Upload failed:', error);
      });
  }

  // Branch is display-only here: it's set at registration / by an admin and the
  // rep cannot change it. Show the real branch names, dropping any legacy value.
  const branchDisplay =
    (profile.branches && profile.branches.length > 0
      ? profile.branches
      : (profile.territory || "").split("·").map((t) => t.trim()))
      .filter((t) => ["Dallas", "West Texas", "Fort Worth"].includes(t))
      .join(", ") || "—";

  function save() {
    props.onProfileChange({
      ...profile,
      webPage: { ...(profile.webPage ?? {}), status: "pendingApproval" },
    });
    setSaveNotice("✓ Saved!");
    if (saveNoticeTimeout.current) clearTimeout(saveNoticeTimeout.current);
    saveNoticeTimeout.current = setTimeout(() => setSaveNotice(""), 2000);
  }

  return (
    <div className="pf-page">
      {/* Faded brand watermark. */}
      <div aria-hidden className="pf-watermark" />

      <div className="pf-grid">
        {/* Photo card */}
        <div className="pf-card pf-photo-card">
          <div className="pf-photo-title">Profile Photo</div>
          <div className="pf-avatar">
            {profile.headshotUrl ? (
              <img src={profile.headshotUrl} alt={profile.name} />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <button type="button" className="pf-upload" onClick={() => fileInputRef.current?.click()}>
            Upload a new photo
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoSelected} />
          <div className="pf-hint">Square images work best. This is the photo that shows on the leaderboard.</div>
        </div>

        {/* Details card */}
        <div className="pf-card pf-form-card">
          <div className="pf-fields">
            <label className="pf-field">
              <span className="pf-label">Full Name</span>
              <input className="pf-input" value={profile.name} onChange={(e) => update({ name: e.target.value })} placeholder="Your name" />
            </label>
            <label className="pf-field">
              <span className="pf-label">Email</span>
              <input className="pf-input pf-input--disabled" value={profile.email} disabled />
              <span className="pf-help">Email cannot be changed</span>
            </label>
            <label className="pf-field">
              <span className="pf-label">Phone</span>
              <input className="pf-input" value={profile.phone ?? ""} onChange={(e) => update({ phone: e.target.value })} placeholder="Your mobile number" />
            </label>
            <label className="pf-field">
              <span className="pf-label">Branch</span>
              <input className="pf-input pf-input--disabled" value={branchDisplay} disabled />
              <span className="pf-help">Set by your manager</span>
            </label>
            <label className="pf-field">
              <span className="pf-label">Sales Team Lead</span>
              <input className="pf-input pf-input--disabled" value={props.teamLeadName || "—"} disabled />
              <span className="pf-help">Set by your manager</span>
            </label>
            <label className="pf-field">
              <span className="pf-label">Branch Manager</span>
              <input className="pf-input pf-input--disabled" value={props.branchManagerName || "—"} disabled />
              <span className="pf-help">Set by your manager</span>
            </label>
          </div>
          <div className="pf-save-row">
            <button type="button" className="pf-save" onClick={save}>Save</button>
            {saveNotice && <span className="pf-notice">{saveNotice}</span>}
          </div>
        </div>
      </div>

      <style jsx>{`
        .pf-page { position: relative; max-width: 1180px; }
        .pf-watermark {
          position: absolute; inset: 0; z-index: 0; pointer-events: none;
          background: url("/ChatGPT_Image_Feb_23__2026__07_00_52_PM-removebg-preview.png") center 24% / min(700px, 62%) no-repeat;
          opacity: 0.05;
        }
        .pf-grid { position: relative; z-index: 1; display: grid; grid-template-columns: 360px 1fr; gap: 20px; align-items: start; }
        @media (max-width: 820px) { .pf-grid { grid-template-columns: 1fr; } }
        .pf-card { background: var(--surface-default); border: 1px solid var(--border-default); border-radius: 18px; padding: 24px; }
        .pf-photo-card { display: flex; flex-direction: column; align-items: center; text-align: center; }
        .pf-photo-title { align-self: flex-start; font-size: 15px; font-weight: 800; color: var(--text-primary); margin-bottom: 18px; }
        .pf-avatar {
          width: 150px; height: 150px; border-radius: 50%; overflow: hidden;
          background: linear-gradient(150deg, #e01418, #9a0002);
          display: flex; align-items: center; justify-content: center;
          color: #fff; font-size: 46px; font-weight: 800; letter-spacing: 0.02em;
          box-shadow: 0 10px 28px rgba(202,0,2,0.3);
        }
        .pf-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .pf-upload {
          margin-top: 20px; padding: 11px 22px; border-radius: 999px;
          background: var(--surface-muted); color: var(--text-primary);
          border: 1px solid var(--border-default); font-size: 14px; font-weight: 700; cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
        }
        .pf-upload:hover { background: var(--surface-subtle); border-color: var(--border-strong); }
        .pf-hint { margin-top: 16px; font-size: 13px; color: var(--text-muted); line-height: 1.5; max-width: 260px; }
        .pf-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px 22px; }
        .pf-field { display: flex; flex-direction: column; }
        .pf-label { font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; }
        .pf-input {
          padding: 13px 16px; border-radius: 10px; font-size: 15px;
          background: var(--surface-subtle); color: var(--text-primary);
          border: 1px solid var(--border-default); outline: none;
        }
        .pf-input:focus { border-color: rgba(224,20,24,0.6); }
        .pf-input--disabled { color: var(--text-muted); cursor: not-allowed; }
        .pf-help { margin-top: 7px; font-size: 12.5px; color: var(--text-muted); }
        .pf-save-row { margin-top: 24px; display: flex; align-items: center; gap: 12px; }
        .pf-save {
          padding: 14px 34px; border-radius: 12px; border: none; cursor: pointer;
          background: linear-gradient(90deg, #b30002, #e01418); color: #fff;
          font-size: 15px; font-weight: 800; box-shadow: 0 4px 14px rgba(202,0,2,0.3);
        }
        .pf-notice { font-size: 13px; color: #10b981; font-weight: 600; }
      `}</style>
    </div>
  );
}
