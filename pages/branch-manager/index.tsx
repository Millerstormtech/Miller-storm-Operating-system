import type { NextPage } from "next";
import { useEffect } from "react";
import { useRouter } from "next/router";

const BranchManagerIndex: NextPage = () => {
  const router = useRouter();
  useEffect(() => {
    router.replace("/branch-manager/dashboard");
  }, [router]);
  return null;
};

export default BranchManagerIndex;
