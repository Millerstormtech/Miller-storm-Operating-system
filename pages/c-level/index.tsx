import type { NextPage } from "next";
import { useEffect } from "react";
import { useRouter } from "next/router";

const CLevelIndex: NextPage = () => {
  const router = useRouter();
  useEffect(() => {
    router.replace("/c-level/dashboard");
  }, [router]);
  return null;
};

export default CLevelIndex;
