import type { NextPage, GetServerSideProps } from "next";

const SalesIndexPage: NextPage = () => {
  return null;
};

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: "/sales/dashboard",
      permanent: false
    }
  };
};

export default SalesIndexPage;
