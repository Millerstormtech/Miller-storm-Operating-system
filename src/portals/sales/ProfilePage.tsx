import { useState, useRef, useEffect, ChangeEvent } from "react";
import { UserProfile } from "../../types";

export function ProfilePage(props: {
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void;
}) {
  const profile = props.profile;
  const initials =
    profile.name && profile.name.trim().length > 0
      ? profile.name.trim().charAt(0).toUpperCase()
      : "J";

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const territoryRef = useRef<HTMLDivElement | null>(null);
  const [isTerritoryOpen, setIsTerritoryOpen] = useState(false);
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

  // Real branches (same list the admin User Management "Branch" field uses).
  const territoryOptions = [
    "Dallas",
    "West Texas",
    "Fort Worth"
  ];

  const selectedTerritories =
    profile.territory && profile.territory.length > 0
      ? profile.territory
          .split("·")
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
          // Drop stale/legacy values (old territories) so only real branches show.
          .filter((t) => territoryOptions.includes(t))
      : [];

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!territoryRef.current) {
        return;
      }
      if (!territoryRef.current.contains(event.target as Node)) {
        setIsTerritoryOpen(false);
      }
    }

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsTerritoryOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeydown);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeydown);
    };
  }, []);

  return (
    <div className="profile-page">
      <div className="profile-card">
        <div className="profile-header-row">
          <div>
            <div className="profile-title">Profile</div>
            <div className="profile-subtitle">Your profile information</div>
          </div>
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
          <div
            className="field territory-field"
            ref={territoryRef}
            onBlur={(event) => {
              const nextTarget = event.relatedTarget as Node | null;
              if (nextTarget && territoryRef.current?.contains(nextTarget)) {
                return;
              }
              setIsTerritoryOpen(false);
            }}
          >
            <span className="field-label">Branch</span>
            <button
              type="button"
              className={
                isTerritoryOpen
                  ? "field-input territory-trigger territory-trigger-open"
                  : "field-input territory-trigger"
              }
              aria-haspopup="listbox"
              aria-expanded={isTerritoryOpen}
              onClick={() => setIsTerritoryOpen((prev) => !prev)}
            >
              <span
                className={
                  selectedTerritories.length > 0
                    ? "territory-trigger-value"
                    : "territory-trigger-placeholder"
                }
              >
                {selectedTerritories.length > 0
                  ? selectedTerritories.join(", ")
                  : "Select branch"}
              </span>
              <span className="territory-trigger-icon">▾</span>
            </button>
            {isTerritoryOpen && (
              <div
                className="territory-dropdown"
                role="listbox"
                aria-multiselectable="true"
              >
                {territoryOptions.map((option) => {
                  const checked = selectedTerritories.includes(option);
                  return (
                    <label
                      key={option}
                      className={
                        checked
                          ? "territory-option territory-option-active"
                          : "territory-option"
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...selectedTerritories, option]
                            : selectedTerritories.filter(
                                (item) => item !== option
                              );
                          update({ territory: next.join(" · "), branches: next });
                        }}
                      />
                      <span>{option}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="form-grid plan-form-grid">
        <label className="field">
          <span className="field-label">Web Page Bio</span>
          <textarea
            className="field-input"
            rows={4}
            value={profile.bio ?? ""}
            onChange={(e) => update({ bio: e.target.value })}
            placeholder="Short personal bio that appears on your public page"
          />
        </label>
      </div>
      <div className="panel-section">
        <div className="profile-title">Public Web Page Fields</div>
        <div className="toggle-grid">
          <label className="toggle-item">
            <input
              type="checkbox"
              checked={profile.publicProfile.showHeadshot}
              onChange={(e) =>
                update({
                  publicProfile: {
                    ...profile.publicProfile,
                    showHeadshot: e.target.checked
                  } as UserProfile["publicProfile"]
                })
              }
            />
            <span className="toggle-label">Show headshot</span>
          </label>
          <label className="toggle-item">
            <input
              type="checkbox"
              checked={profile.publicProfile.showEmail}
              onChange={(e) =>
                update({
                  publicProfile: {
                    ...profile.publicProfile,
                    showEmail: e.target.checked
                  } as UserProfile["publicProfile"]
                })
              }
            />
            <span className="toggle-label">Show email</span>
          </label>
          <label className="toggle-item">
            <input
              type="checkbox"
              checked={profile.publicProfile.showPhone}
              onChange={(e) =>
                update({
                  publicProfile: {
                    ...profile.publicProfile,
                    showPhone: e.target.checked
                  } as UserProfile["publicProfile"]
                })
              }
            />
            <span className="toggle-label">Show phone</span>
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
