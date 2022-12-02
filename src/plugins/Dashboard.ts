import { registerPlugin} from "@capacitor/core";

export interface DashboardPlugin {
  getTest(): Promise<{test: "test"}>;
}

// const Dashboard = registerPlugin<DashboardPlugin>("Dashboard");

// export default Dashboard;