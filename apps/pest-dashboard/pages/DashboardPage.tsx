
import React from 'react';
import { Card, StatCard } from '../components/Card';
import { useAppContext } from '../App';
import { AlertStatus } from '../types';
import { AlertsList } from './components/AlertsList';

const DashboardPage: React.FC = () => {
    const { districts, farmers, alerts } = useAppContext();
    const activeAlerts = alerts.filter(a => a.status === AlertStatus.ACTIVE);
    
    const ICONS = {
        Districts: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-white"><path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.5-10.5h-7a.5.5 0 00-.5.5v12a.5.5 0 00.5.5h7a.5.5 0 00.5-.5v-12a.5.5 0 00-.5-.5z" /></svg>,
        Farmers: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-white"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-4.598M12 14.25a5.25 5.25 0 100-10.5 5.25 5.25 0 000 10.5z" /></svg>,
        Alerts: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-white"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
    };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard title="Total Districts" value={districts.length} icon={ICONS.Districts} color="bg-blue-500" />
        <StatCard title="Registered Farmers" value={farmers.length} icon={ICONS.Farmers} color="bg-green-500" />
        <StatCard title="Active Alerts" value={activeAlerts.length} icon={ICONS.Alerts} color="bg-red-500" />
      </div>

      <Card>
        <h2 className="text-xl font-semibold mb-4">Recent Alerts</h2>
        <AlertsList alerts={alerts.slice(0, 5)} showCancel={false} />
      </Card>
    </div>
  );
};

export default DashboardPage;
