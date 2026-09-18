import type { NextPage } from "next";
import { AdminLayout } from "../../src/portals/admin/AdminLayout";
import { CanvassMap } from "../../src/portals/shared/canvass-map/CanvassMap";

// Thin route shell, in the shape of the other admin pages. The screen is shared
// by every role: src/portals/shared/canvass-map/.
const CanvassMapPage: NextPage = () => {
  return (
    <AdminLayout currentView="canvassMap" pageTitle="Canvass Map">
      <CanvassMap />
    </AdminLayout>
  );
};

export default CanvassMapPage;
