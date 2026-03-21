import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, Bell, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
  timestamp: Date;
  read: boolean;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  removeNotification: (id: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within NotificationProvider');
  return context;
};

interface NotificationProviderProps {
  children: React.ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: Notification = {
      ...notification,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      read: false,
    };
    // Keep last 100 notifications
    setNotifications(prev => [newNotification, ...prev].slice(0, 100));
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      addNotification,
      removeNotification,
      markAsRead,
      markAllAsRead,
      clearAll,
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

// ==================== NOTIFICATION LIST (popover) ====================

interface NotificationListProps {
  onViewAll?: () => void;
}

export const NotificationList: React.FC<NotificationListProps> = ({ onViewAll }) => {
  const { notifications, removeNotification, markAsRead, markAllAsRead, clearAll, unreadCount } = useNotifications();

  const getTypeStyles = (type: Notification['type'], read: boolean) => {
    const opacity = read ? 'opacity-60' : '';
    switch (type) {
      case 'success': return `bg-green-50 dark:bg-green-900/20 ${opacity}`;
      case 'warning': return `bg-amber-50 dark:bg-amber-900/20 ${opacity}`;
      case 'error': return `bg-red-50 dark:bg-red-900/20 ${opacity}`;
      default: return `bg-blue-50 dark:bg-blue-900/20 ${opacity}`;
    }
  };

  const getTypeDot = (type: Notification['type']) => {
    switch (type) {
      case 'success': return 'bg-green-500';
      case 'warning': return 'bg-amber-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-blue-500';
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  // Show only last 5 in popover, rest via "View all"
  const recent = notifications.slice(0, 5);

  return (
    <div className="w-80">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-foreground" />
          <span className="text-sm font-semibold text-foreground">Notifications</span>
          {unreadCount > 0 && (
            <span className="text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 font-medium">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
            >
              <CheckCheck className="h-3 w-3" />
              Mark all read
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={clearAll}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Notification list */}
      {notifications.length === 0 ? (
        <div className="p-8 text-center">
          <Bell className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No notifications yet</p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-border max-h-72 overflow-y-auto">
            {recent.map(notification => (
              <div
                key={notification.id}
                className={`p-3 flex items-start gap-3 cursor-pointer transition-colors hover:brightness-95 ${getTypeStyles(notification.type, notification.read)}`}
                onClick={() => markAsRead(notification.id)}
              >
                {/* Unread dot */}
                <div className="mt-1.5 flex-shrink-0">
                  {!notification.read ? (
                    <span className={`block w-2 h-2 rounded-full ${getTypeDot(notification.type)}`} />
                  ) : (
                    <span className="block w-2 h-2 rounded-full bg-transparent" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${notification.read ? 'text-muted-foreground' : 'text-foreground'}`}>
                    {notification.title}
                  </p>
                  {notification.message && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notification.message}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{formatTime(notification.timestamp)}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeNotification(notification.id); }}
                  className="text-muted-foreground hover:text-foreground flex-shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* View all button */}
          {notifications.length > 5 && onViewAll && (
            <div className="border-t border-border p-2">
              <Button variant="ghost" size="sm" className="w-full text-xs" onClick={onViewAll}>
                View all {notifications.length} notifications
              </Button>
            </div>
          )}
          {notifications.length <= 5 && notifications.length > 0 && (
            <div className="border-t border-border px-4 py-2">
              <p className="text-xs text-muted-foreground">Click a notification to mark as read</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ==================== FULL HISTORY PANEL ====================

export const NotificationHistory: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { notifications, removeNotification, markAsRead, markAllAsRead, clearAll, unreadCount } = useNotifications();

  const getTypeDot = (type: Notification['type']) => {
    switch (type) { case 'success': return 'bg-green-500'; case 'warning': return 'bg-amber-500'; case 'error': return 'bg-red-500'; default: return 'bg-blue-500'; }
  };

  const getTypeBadge = (type: Notification['type']) => {
    switch (type) {
      case 'success': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'warning': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      case 'error': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    }
  };

  const formatFullTime = (date: Date) => {
    return date.toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-end p-4">
      <div className="w-full max-w-md bg-background border border-border rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-foreground" />
            <h2 className="text-base font-semibold text-foreground">All Notifications</h2>
            {unreadCount > 0 && (
              <span className="text-xs bg-primary text-primary-foreground rounded-full px-2 py-0.5 font-medium">
                {unreadCount} unread
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Actions */}
        {notifications.length > 0 && (
          <div className="flex items-center gap-3 px-5 py-2 border-b border-border flex-shrink-0">
            {unreadCount > 0 && (
              <button onClick={markAllAsRead} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all as read
              </button>
            )}
            <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-destructive ml-auto">
              Clear all
            </button>
          </div>
        )}

        {/* List */}
        <div className="overflow-y-auto flex-1">
          {notifications.length === 0 ? (
            <div className="p-12 text-center">
              <Bell className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map(notification => (
                <div
                  key={notification.id}
                  className={`px-5 py-4 flex items-start gap-3 cursor-pointer hover:bg-muted/50 transition-colors ${!notification.read ? 'bg-muted/20' : ''}`}
                  onClick={() => markAsRead(notification.id)}
                >
                  <div className="mt-1.5 flex-shrink-0">
                    {!notification.read ? (
                      <span className={`block w-2.5 h-2.5 rounded-full ${getTypeDot(notification.type)}`} />
                    ) : (
                      <span className="block w-2.5 h-2.5 rounded-full bg-muted-foreground/20" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className={`text-sm font-medium ${notification.read ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {notification.title}
                      </p>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${getTypeBadge(notification.type)}`}>
                        {notification.type}
                      </span>
                    </div>
                    {notification.message && (
                      <p className="text-sm text-muted-foreground mt-0.5">{notification.message}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1.5">{formatFullTime(notification.timestamp)}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeNotification(notification.id); }}
                    className="text-muted-foreground hover:text-destructive flex-shrink-0 mt-0.5"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationProvider;
