import React, { useState } from 'react';
import type { Alert } from '../../types';
import { AlertStatus } from '../../types';
import { useAppContext } from '../../App';
import { SEVERITY_CONFIG } from '../../constants';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';

interface AlertsListProps {
  alerts: Alert[];
  showCancel?: boolean;
}

export const AlertsList: React.FC<AlertsListProps> = ({ alerts, showCancel = false }) => {
  const { districts, cancelAlert, addToast } = useAppContext();
  const districtMap = new Map(districts.map(d => [d.id, d.name]));

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [alertToCancel, setAlertToCancel] = useState<Alert | null>(null);

  const openCancelModal = (alert: Alert) => {
    setAlertToCancel(alert);
    setIsCancelModalOpen(true);
  };

  const closeCancelModal = () => {
    setAlertToCancel(null);
    setIsCancelModalOpen(false);
  };

  const handleConfirmCancel = async () => {
    if (alertToCancel) {
      try {
        await cancelAlert(alertToCancel.id);
      } catch (error) {
        addToast('Failed to cancel alert.', 'error');
        console.error(error);
      }
    }
    closeCancelModal();
  };


  if (alerts.length === 0) {
    return <p className="text-gray-500 dark:text-gray-400">No alerts to display.</p>;
  }

  return (
    <>
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                    <tr>
                        <th scope="col" className="px-6 py-3">Severity</th>
                        <th scope="col" className="px-6 py-3">Pest Type</th>
                        <th scope="col" className="px-6 py-3">Reported In</th>
                        <th scope="col" className="px-6 py-3">Date</th>
                        <th scope="col" className="px-6 py-3">Status</th>
                        {showCancel && <th scope="col" className="px-6 py-3">Actions</th>}
                    </tr>
                </thead>
                <tbody>
                    {alerts.map(alert => (
                        <tr key={alert.id} className="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                            <td className="px-6 py-4">
                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${SEVERITY_CONFIG[alert.severity].twClass}`}>
                                    {SEVERITY_CONFIG[alert.severity].label}
                                </span>
                            </td>
                            <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap dark:text-white">{alert.pestType}</td>
                            <td className="px-6 py-4">{districtMap.get(alert.reportedDistrictId) || 'Unknown'}</td>
                            <td className="px-6 py-4">{new Date(alert.reportedAt).toLocaleString()}</td>
                            <td className="px-6 py-4">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${alert.status === AlertStatus.ACTIVE ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'}`}>
                                    {alert.status}
                                </span>
                            </td>
                            {showCancel && (
                                <td className="px-6 py-4">
                                    {alert.status === AlertStatus.ACTIVE && (
                                        <Button variant="danger" onClick={() => openCancelModal(alert)}>
                                            Cancel
                                        </Button>
                                    )}
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
        <Modal
            isOpen={isCancelModalOpen}
            onClose={closeCancelModal}
            title="Confirm Alert Cancellation"
        >
            <div className="space-y-4">
                <p className="text-gray-600 dark:text-gray-400">
                    Are you sure you want to cancel the <strong>{alertToCancel?.severity}</strong> severity <strong>{alertToCancel?.pestType}</strong> alert
                    in <strong>{districtMap.get(alertToCancel?.reportedDistrictId || '')}</strong>?
                </p>
                <p className="text-sm text-gray-500">This action cannot be undone.</p>
                <div className="flex justify-end pt-2 space-x-2">
                    <Button variant="secondary" onClick={closeCancelModal}>
                        No, Keep Alert
                    </Button>
                    <Button variant="danger" onClick={handleConfirmCancel}>
                        Yes, Cancel Alert
                    </Button>
                </div>
            </div>
      </Modal>
    </>
  );
};
