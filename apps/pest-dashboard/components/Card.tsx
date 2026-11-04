import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = '' }) => {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 ${className}`}>
      {children}
    </div>
  );
};

interface StatCardProps {
  title: string;
  value: string | number;
  // FIX: Use React.ReactNode instead of JSX.Element to resolve namespace issue.
  icon: React.ReactNode;
  color: string;
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color }) => (
    <Card className="flex items-center">
        <div className={`p-3 rounded-full mr-4 ${color}`}>
            {icon}
        </div>
        <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
            <p className="text-2xl font-bold text-gray-800 dark:text-gray-200">{value}</p>
        </div>
    </Card>
);
