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

  return (
    <div className="profile-page">
      <div className="profile-card">
        <div className="profile-header-row">
        </div>
        <div className="profile-photo-row">
          <div className="profile-photo-wrapper">
            {profile.headshotUrl ? (
              <img
                src={profile.headshotUrl}
                alt={profile.name}
                className="profile-photo-image"
              />
            ) : (
              <div className="profile-photo-initials">{initials}</div>
            )}
          </div>
          <div className="profile-photo-text">
            <div className="profile-photo-title">Profile Photo</div>
            <button
              type="button"
              className="profile-photo-upload"
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
            >
              Click to upload
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handlePhotoSelected}
            />
            <div className="profile-photo-hint">JPG, PNG · Max 100MB</div>
          </div>
        </div>
        <div className="profile-body-grid">
          <label className="field">
            <span className="field-label">Full Name</span>
            <input
              className="field-input"
              value={profile.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="Your name"
            />
          </label>
          <label className="field">
            <span className="field-label">Email</span>
            <input
              className="field-input field-input-disabled"
              value={profile.email}
              disabled
            />
            <span className="field-help">Email cannot be changed</span>
          </label>
          <label className="field">
            <span className="field-label">Phone</span>
            <input
              className="field-input"
              value={profile.phone ?? ""}
              onChange={(e) => update({ phone: e.target.value })}
              placeholder="Your mobile number"
            />
          </label>
          <label className="field">
            <span className="field-label">Branch</span>
            <input className="field-input field-input-disabled" value={branchDisplay} disabled />
            <span className="field-help">Set by your admin — cannot be changed here</span>
          </label>
          <label className="field">
            <span className="field-label">Sales Team Lead</span>
            <input className="field-input field-input-disabled" value={props.teamLeadName || "—"} disabled />
            <span className="field-help">Set by your admin — cannot be changed here</span>
          </label>
          <label className="field">
            <span className="field-label">Branch Manager</span>
            <input className="field-input field-input-disabled" value={props.branchManagerName || "—"} disabled />
            <span className="field-help">Set by your admin — cannot be changed here</span>
          </label>
        </div>
      </div>
      <div className="profile-save-row">
        <button
          type="button"
          className="btn-primary btn-success"
          onClick={() => {
            props.onProfileChange({
              ...profile,
              webPage: {
                ...(profile.webPage ?? {}),
                status: "pendingApproval"
              }
            });
            setSaveNotice("✓ Submitted for approval!");
            if (saveNoticeTimeout.current) {
              clearTimeout(saveNoticeTimeout.current);
            }
            saveNoticeTimeout.current = setTimeout(() => {
              setSaveNotice("");
            }, 2000);
          }}
        >
          Save & Publish
        </button>
        {saveNotice && (
          <span style={{ fontSize: 12, color: "#16a34a", marginLeft: 8 }}>
            {saveNotice}
          </span>
        )}
      </div>
    </div>
  );
}
