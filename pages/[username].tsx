import type { NextPage } from "next";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { WebPagePreview } from "../src/portals/sales/WebPagePreview";
import { UserProfile } from "../src/types";

const UserWebPage: NextPage = () => {
  const router = useRouter();
  const { username } = router.query;
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    async function loadPublicProfile() {
      if (!username) return;
      try {
        const res = await fetch(`/api/public-profile/${username}`);
        if (res.ok) {
          const data = await res.json();
          setProfile(data);
        }
      } catch (error) {
        console.error("Failed to load profile:", error);
      }
    }
    loadPublicProfile();
  }, [username]);

  if (!profile) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2>Page Not Available</h2>
        <p>This page is not published yet or does not exist.</p>
      </div>
    );
  }

  return <WebPagePreview profile={profile} onProfileChange={() => {}} isPublic />;
};

export default UserWebPage;
