import React, { createContext, useContext, useState, useCallback } from 'react';
import { X } from 'lucide-react';

interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
  timestamp: Date;
}

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};

interface NotificationProviderProps {
  children: React.ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'timestamp'>) => {
    const newNotification: Notification = {
      ...notification,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
    };
    setNotifications(prev => [newNotification, ...prev].slice(0, 50)); // Keep last 50
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, addNotification, removeNotification, clearAll }}>
      {children}
    </NotificationContext.Provider>
  );
};

// Notification Display Component
export const NotificationList: React.FC = () => {
  const { notifications, removeNotification, clearAll } = useNotifications();

  if (notifications.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        No notifications
      </div>
    );
  }

  const getTypeStyles = (type: Notification['type']) => {
    switch (type) {
      case 'success': return 'bg-accent/10 border-accent/20';
      case 'warning': return 'bg-warning/10 border-warning/20';
      case 'error': return 'bg-destructive/10 border-destructive/20';
      default: return 'bg-primary/10 border-primary/20';
    }
  };

  return (
    <div className="max-h-80 overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-sm font-medium text-foreground">Notifications</span>
        <button 
          onClick={clearAll}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear all
        </button>
      </div>
      <div className="divide-y divide-border">
        {notifications.map(notification => (
          <div 
            key={notification.id}
            className={`p-3 flex items-start gap-3 ${getTypeStyles(notification.type)}`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{notification.title}</p>
              {notification.message && (
                <p className="text-xs text-muted-foreground mt-0.5">{notification.message}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {notification.timestamp.toLocaleTimeString()}
              </p>
            </div>
            <button 
              onClick={() => removeNotification(notification.id)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default NotificationProvider;
