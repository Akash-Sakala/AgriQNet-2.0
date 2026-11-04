import React, { useState, useCallback, useEffect, createContext, useContext } from 'react';
import type { District, Farmer, Alert, Severity, Edge, Toast as ToastType, AlertRecipient } from './types';
import { AlertStatus } from './types';
import { apiService } from './services/apiService';
import DashboardPage from './pages/DashboardPage';
import AlertsPage from './pages/AlertsPage';
import FarmersPage from './pages/FarmersPage';
import DistrictsPage from './pages/DistrictsPage';
import OutboxPage from './pages/OutboxPage';
import { Sidebar } from './components/Sidebar';
import { Spinner } from './components/Spinner';
import Toast from './components/Toast';


type AppContextType = {
  districts: District[];
  edges: Edge[];
  farmers: Farmer[];
  alerts: Alert[];
  alertRecipients: AlertRecipient[];
  loading: boolean;
  error: string | null;
  refreshData: () => Promise<void>;
  reportAlert: (districtId: string, severity: Severity, pestType: string) => Promise<void>;
  cancelAlert: (alertId: string) => Promise<void>;
  addFarmer: (farmer: Omit<Farmer, 'id'>) => Promise<void>;
  addToast: (message: string, type: 'success' | 'error') => void;
};

const AppContext = createContext<AppContextType | null>(null);
export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within an AppProvider');
  return context;
};

const App: React.FC = () => {
  const [districts, setDistricts] = useState<District[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertRecipients, setAlertRecipients] = useState<AlertRecipient[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activePage, setActivePage] = useState('Dashboard');
  const [toasts, setToasts] = useState<ToastType[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [districtsData, edgesData, farmersData, alertsData, recipientsData] = await Promise.all([
        apiService.getDistricts(),
        apiService.getEdges(),
        apiService.getFarmers(),
        apiService.getAlerts(),
        apiService.getAlertRecipients(),
      ]);
      setDistricts(districtsData);
      setEdges(edgesData);
      setFarmers(farmersData);
      setAlerts(alertsData.sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime()));
      setAlertRecipients(recipientsData);
    } catch (err) {
      console.error("FETCH ERROR:", err);
      setError("Failed to fetch data from the AgriQNet API (http://localhost:5000). Is it running? Start everything with `npm start` in agriqnet-platform.");
    }

    finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts(prevToasts => [...prevToasts, { id, message, type }]);
  };

  const removeToast = (id: number) => {
    setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
  };

  const reportAlert = async (districtId: string, severity: Severity, pestType: string) => {
    const { newAlert, summary, recipients } = await apiService.reportAlert(districtId, severity, pestType);
    setAlerts(prevAlerts => 
        [newAlert, ...prevAlerts].sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime())
    );
    setAlertRecipients(prev => [...prev, ...recipients]);
    addToast(summary, 'success');
  };

  const cancelAlert = async (alertId: string) => {
    const { canceledAlertId } = await apiService.cancelAlert(alertId);
    setAlerts(prevAlerts =>
      prevAlerts.map(alert =>
        alert.id === canceledAlertId ? { ...alert, status: AlertStatus.CANCELLED } : alert
      )
    );
    addToast('Alert successfully cancelled.', 'success');
  };
  
  // const addFarmer = async (farmer: Omit<Farmer, 'id'>) => {
  //   const newFarmer = await apiService.addFarmer(farmer);
  //   setFarmers(prevFarmers => [...prevFarmers, newFarmer]);
  //   addToast('Farmer successfully added.', 'success');
  // };

const addFarmer = async (farmer: Omit<Farmer, "id">) => {
  const response = await apiService.addFarmer(farmer);

  const saved = response.farmer;

  const newFarmer = {
    id: saved.id ?? saved._id,
    name: saved.name,
    phone: saved.phone,
    districtId: saved.districtId,
  };

  // Add farmer to state
  setFarmers(prev => [...prev, newFarmer]);

  // 🔥 Always refresh recipients AFTER adding farmer
  const refreshedRecipients = await apiService.getAlertRecipients();
  setAlertRecipients(refreshedRecipients);

  addToast(response.message || "Farmer successfully added.", "success");
};



  const renderPage = () => {
    switch (activePage) {
      case 'Dashboard':
        return <DashboardPage />;
      case 'Alerts':
        return <AlertsPage />;
      case 'Farmers':
        return <FarmersPage />;
      case 'Districts':
        return <DistrictsPage />;
      case 'Outbox':
        return <OutboxPage />;
      default:
        return <DashboardPage />;
    }
  };

  const contextValue: AppContextType = {
    districts,
    edges,
    farmers,
    alerts,
    alertRecipients,
    loading,
    error,
    refreshData: fetchData,
    reportAlert,
    cancelAlert,
    addFarmer,
    addToast,
  };

  return (
    <AppContext.Provider value={contextValue}>
      <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
        <Sidebar activePage={activePage} setActivePage={setActivePage} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {loading ? (
            <div className="flex justify-center items-center h-full">
              <Spinner />
            </div>
          ) : error ? (
            <div className="text-red-500 text-center">{error}</div>
          ) : (
            renderPage()
          )}
        </main>
        
        {/* Toast Container */}
        <div aria-live="assertive" className="fixed inset-0 flex items-end px-4 py-6 pointer-events-none sm:p-6 sm:items-start z-[100]">
            <div className="w-full flex flex-col items-center space-y-4 sm:items-end">
                {toasts.map(toast => (
                    <Toast key={toast.id} {...toast} onClose={removeToast} />
                ))}
            </div>
        </div>

      </div>
    </AppContext.Provider>
  );
};

export default App;