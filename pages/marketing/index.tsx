import type { NextPage, GetServerSideProps } from "next";

const MarketingIndexPage: NextPage = () => {
  return null;
};

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: "/marketing/dashboard",
      permanent: false
    }
  };
};

export default MarketingIndexPage;
