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
  const [activeTab, setActiveTab] = useState<'profile' | 'training'>('profile');
  const [trainingData, setTrainingData] = useState<{ course: any; completed: number; total: number; isCompleted: boolean }[]>([]);
  const [isLoadingTraining, setIsLoadingTraining] = useState(false);

  useEffect(() => {
    if (activeTab !== 'training' || !profile.id) return;
    setIsLoadingTraining(true);
    fetch('/api/courses').then(r => r.json()).then(async (courses) => {
      const published = (courses || []).filter((c: any) => c.status === 'published');
      if (!published.length) { setTrainingData([]); setIsLoadingTraining(false); return; }
      const courseIds = published.map((c: any) => c.id).join(',');
      const progRes = await fetch(`/api/course-progress?userId=${profile.id}&courseIds=${courseIds}`);
      const progData = progRes.ok ? await progRes.json() : {};
      const rows = published.map((course: any) => {
        const lessonPages = (course.pages || []).filter((p: any) => p.status === 'published' && !p.isQuiz);
        const total = lessonPages.length;
        const lessonIds = new Set(lessonPages.map((p: any) => p.id));
        const rec = progData[course.id] || {};
        const completed = (rec.completedPages || []).filter((id: string) => lessonIds.has(id)).length;
        return { course, completed, total, isCompleted: rec.courseCompleted || false };
      }).filter((r: any) => r.total > 0);
      setTrainingData(rows);
    }).catch(console.error).finally(() => setIsLoadingTraining(false));
  }, [activeTab, profile.id]);

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

  const territoryOptions = [
    "DFW, Texas",
    "Lubbock, Texas",
    "Round Rock, Texas",
    "Other"
  ];

  const selectedTerritories =
    profile.territory && profile.territory.length > 0
      ? profile.territory
          .split("·")
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
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
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '2px solid #e5e7eb' }}>
        {(['profile', 'training'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '12px 28px', background: 'none', border: 'none',
              borderBottom: activeTab === tab ? '2px solid #2563eb' : '2px solid transparent',
              color: activeTab === tab ? '#2563eb' : '#6b7280',
              fontWeight: activeTab === tab ? 600 : 400,
              cursor: 'pointer', marginBottom: '-2px', fontSize: 16
            }}
          >
            {tab === 'profile' ? 'Profile' : 'Training Progress'}
          </button>
        ))}
      </div>

      {activeTab === 'training' ? (
        <div>
          {isLoadingTraining ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>Loading...</div>
          ) : trainingData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>No courses available.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {trainingData.map(({ course, completed, total, isCompleted }) => {
                const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                return (
                  <div key={course.id} style={{
                    background: '#fff', border: '1px solid #e5e7eb',
                    borderRadius: 12, padding: '20px 24px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#111827', marginBottom: 4 }}>
                      {course.title}
                    </div>
                    <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>Training Center Progress</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 8 }}>
                      <span style={{ color: '#374151' }}>Lessons Completed: <strong>{completed} / {total}</strong></span>
                      <span style={{ fontWeight: 700, color: isCompleted ? '#10b981' : '#2563eb' }}>
                        {isCompleted ? '✓ Completed' : `Course Completion: ${pct}%`}
                      </span>
                    </div>
                    <div style={{ height: 10, borderRadius: 999, background: '#e5e7eb', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 999,
                        background: isCompleted ? '#10b981' : '#22c55e',
                        width: `${pct}%`, transition: 'width 0.4s'
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
      <>
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
            <span className="field-label">Territory</span>
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
                  : "Select territories"}
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
                          update({ territory: next.join(" · ") });
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
          <span className="field-label">Strengths / Superpowers</span>
          <textarea
            className="field-input"
            rows={4}
            value={profile.strengths}
            onChange={(e) => update({ strengths: e.target.value })}
          />
        </label>
        <label className="field">
          <span className="field-label">Weaknesses / Insecurities</span>
          <textarea
            className="field-input"
            rows={4}
            value={profile.weaknesses}
            onChange={(e) => update({ weaknesses: e.target.value })}
          />
        </label>
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
      </>
      )}
    </div>
  );
}
