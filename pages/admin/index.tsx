import type { NextPage, GetServerSideProps } from "next";

const AdminIndexPage: NextPage = () => {
  return null;
};

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: "/admin/dashboard",
      permanent: false
    }
  };
};

export default AdminIndexPage;
