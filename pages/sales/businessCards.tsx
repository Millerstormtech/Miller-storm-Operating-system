import type { NextPage } from "next";
import { SalesLayout } from "../../src/portals/sales/SalesLayout";
import { BusinessCardsRequest } from "../../src/portals/sales/BusinessCardsRequest";
import { useAuth } from "../../src/contexts/AuthContext";

const BusinessCards: NextPage = () => {
  const { user } = useAuth();
  if (!user) return <div>Loading...</div>;

  return (
    <SalesLayout currentView="businessCards" userName={user.name} userId={user.id}>
      <BusinessCardsRequest />
    </SalesLayout>
  );
};

export default BusinessCards;
