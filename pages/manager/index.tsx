import type { NextPage, GetServerSideProps } from "next";

const ManagerIndexPage: NextPage = () => {
  return null;
};

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: "/manager/dashboard",
      permanent: false
    }
  };
};

export default ManagerIndexPage;
