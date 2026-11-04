import React, { useMemo, useState } from "react";
import { useAppContext } from "../App";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { AddFarmerModal } from "./components/AddFarmerModal";
import { Modal } from "../components/Modal";
import {
  AlertStatus,
  Severity,
  type Alert,
  type Farmer as FarmerType,
} from "../types";

const AlertIndicator: React.FC<{
  hasAlert: boolean;
  severity: Severity;
}> = ({ hasAlert, severity }) => {
  if (!hasAlert) {
    return <span className="text-gray-400 dark:text-gray-500">-</span>;
  }

  const colors: Record<Severity, string> = {
    [Severity.RED]: "bg-red-500",
    [Severity.ORANGE]: "bg-orange-500",
    [Severity.YELLOW]: "bg-yellow-400",
  };

  const textColors: Record<Severity, string> = {
    [Severity.RED]: "text-red-800 dark:text-red-200",
    [Severity.ORANGE]: "text-orange-800 dark:text-orange-200",
    [Severity.YELLOW]: "text-yellow-800 dark:text-yellow-200",
  };

  return (
    <div className={`flex items-center font-medium ${textColors[severity]}`}>
      <span className={`h-3 w-3 rounded-full ${colors[severity]} mr-2`} />
      <span>Active</span>
    </div>
  );
};

const FarmersPage: React.FC = () => {
  const { farmers, districts, alerts, alertRecipients, edges } =
    useAppContext();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFarmer, setSelectedFarmer] = useState<FarmerType | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const districtMap = useMemo(
    () => new Map(districts.map((d) => [d.id, d.name])),
    [districts]
  );

  // ---------------------------
  // BUILD FARMER ALERT STATUS MAP
  // ---------------------------
  const farmerAlertStatus = useMemo(() => {
    const activeAlerts = new Map<string, Alert>();
    alerts.forEach((alert) => {
      if (alert.status === AlertStatus.ACTIVE) {
        activeAlerts.set(alert.id, alert);
      }
    });

    const statusMap = new Map<string, Record<Severity, boolean>>();
    farmers.forEach((f) => {
      statusMap.set(f.id, {
        [Severity.RED]: false,
        [Severity.ORANGE]: false,
        [Severity.YELLOW]: false,
      });
    });

    alertRecipients.forEach((recipient) => {
      const alert = activeAlerts.get(recipient.alertId);
      if (alert) {
        const farmerStatus = statusMap.get(recipient.farmerId);
        if (farmerStatus) {
          farmerStatus[alert.severity] = true;
        }
      }
    });

    return statusMap;
  }, [alerts, alertRecipients, farmers]);

  // ---------------------------
  // BFS (Depth 2) - Get neighbors for selected farmer
  // ---------------------------
  const getNeighbors = (startId: string, depth: number) => {
    const graph = new Map<string, string[]>();

    edges.forEach((e) => {
      if (!graph.has(e.districtAId)) graph.set(e.districtAId, []);
      if (!graph.has(e.districtBId)) graph.set(e.districtBId, []);

      graph.get(e.districtAId)!.push(e.districtBId);
      graph.get(e.districtBId)!.push(e.districtAId);
    });

    const visited = new Set<string>();
    const queue: { id: string; dist: number }[] = [
      { id: startId, dist: 0 },
    ];

    while (queue.length) {
      const { id, dist } = queue.shift()!;
      if (visited.has(id) || dist > depth) continue;

      visited.add(id);

      const neighbors = graph.get(id) || [];
      neighbors.forEach((n) => queue.push({ id: n, dist: dist + 1 }));
    }

    return visited;
  };

  // ---------------------------
  // BFS-BASED ALERT DETAILS FOR MODAL
  // ---------------------------
  const bfsAlertDetails = useMemo(() => {
    if (!selectedFarmer) return [];

    const neighbors = getNeighbors(selectedFarmer.districtId, 2);

    const resultMap = new Map<string, Severity>(); // pestType -> highest severity

    const severityRank = {
      RED: 3,
      ORANGE: 2,
      YELLOW: 1,
    };

    alerts.forEach((alert) => {
      if (neighbors.has(alert.reportedDistrictId)) {
        const existing = resultMap.get(alert.pestType);
        // pick higher severity if duplicate
        if (!existing || severityRank[alert.severity] > severityRank[existing]) {
          resultMap.set(alert.pestType, alert.severity);
        }
      }
    });

    return Array.from(resultMap.entries()).map(([pestType, severity]) => ({
      pestType,
      severity,
    }));
  }, [selectedFarmer, alerts, edges]);

  const openDetailsModal = (farmer: FarmerType) => {
    setSelectedFarmer(farmer);
    setDetailsOpen(true);
  };

  const closeDetailsModal = () => {
    setDetailsOpen(false);
    setSelectedFarmer(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200">
          Farmers
        </h1>
        <Button onClick={() => setIsModalOpen(true)}>
          <div className="flex items-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 mr-2"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 11a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1v-1z" />
            </svg>
            Add Farmer
          </div>
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
              <tr>
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Phone</th>
                <th className="px-6 py-3">District</th>
                <th className="px-6 py-3">Severe Alert</th>
                <th className="px-6 py-3">Medium Alert</th>
                <th className="px-6 py-3">Low Alert</th>
                <th className="px-6 py-3">Details</th>
              </tr>
            </thead>

            <tbody>
              {farmers.map((farmer) => {
                const farmerAlerts =
                  farmerAlertStatus.get(farmer.id) || {
                    RED: false,
                    ORANGE: false,
                    YELLOW: false,
                  };

                return (
                  <tr
                    key={farmer.id}
                    className="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
                  >
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                      {farmer.name}
                    </td>
                    <td className="px-6 py-4">{farmer.phone}</td>
                    <td className="px-6 py-4">
                      {districtMap.get(farmer.districtId) || "Unknown"}
                    </td>

                    <td className="px-6 py-4">
                      <AlertIndicator
                        hasAlert={farmerAlerts.RED}
                        severity={Severity.RED}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <AlertIndicator
                        hasAlert={farmerAlerts.ORANGE}
                        severity={Severity.ORANGE}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <AlertIndicator
                        hasAlert={farmerAlerts.YELLOW}
                        severity={Severity.YELLOW}
                      />
                    </td>

                    <td className="px-6 py-4">
                      <Button type="button" onClick={() => openDetailsModal(farmer)}>
                        View
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <AddFarmerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      {/* MODAL WITH BFS DETAILS */}
      {detailsOpen && selectedFarmer && (
        <Modal
          isOpen={detailsOpen}
          onClose={closeDetailsModal}
          title={`Alerts near ${selectedFarmer.name}`}
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Showing pest alerts in the farmer’s district and its neighboring
              regions (Level 0, 1, and 2).
            </p>

            {bfsAlertDetails.length === 0 ? (
              <p className="text-gray-600 dark:text-gray-300">
                No alerts found in this region or nearby districts.
              </p>
            ) : (
              <ul className="list-disc pl-5 space-y-1">
                {bfsAlertDetails.map((a, idx) => (
                  <li key={idx} className="text-gray-800 dark:text-gray-200">
                    <strong>{a.pestType}</strong>{" "}
                    <span className="text-sm text-gray-500">
                      ({a.severity} severity)
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex justify-end pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={closeDetailsModal}
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default FarmersPage;




