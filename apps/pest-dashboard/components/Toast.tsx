import React, { useEffect, useState } from 'react';

export interface ToastProps {
  id: number;
  message: string;
  type: 'success' | 'error';
  onClose: (id: number) => void;
}

const ICONS = {
    success: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    ),
    error: (
         <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    ),
};

const Toast: React.FC<ToastProps> = ({ id, message, type, onClose }) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        setVisible(true); // Trigger fade-in animation
        const timer = setTimeout(() => {
            handleClose();
        }, 5000);

        return () => clearTimeout(timer);
    }, [id, onClose]);
    
    const handleClose = () => {
        setVisible(false);
        setTimeout(() => onClose(id), 300); // Wait for fade-out to finish
    }

    return (
        <div className={`
            max-w-sm w-full bg-white dark:bg-gray-800 shadow-lg rounded-lg pointer-events-auto ring-1 ring-black ring-opacity-5 overflow-hidden
            transition-all duration-300 ease-in-out
            ${visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
        `}>
            <div className="p-4">
                <div className="flex items-start">
                    <div className="flex-shrink-0">
                        {ICONS[type]}
                    </div>
                    <div className="ml-3 w-0 flex-1 pt-0.5">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{message}</p>
                    </div>
                    <div className="ml-4 flex-shrink-0 flex">
                        <button onClick={handleClose} className="bg-white dark:bg-gray-800 rounded-md inline-flex text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                            <span className="sr-only">Close</span>
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Toast;
