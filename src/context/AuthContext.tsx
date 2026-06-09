import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { registerFcmToken, unregisterFcmToken } from '../services/fcmService';
import { requestNotificationPermission } from '../utils/notificationAlert';
import type { UserData } from '../types/user';

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userData: UserData | null;
  loading: boolean;
  hasPermission: (permission: keyof NonNullable<UserData['permissions']>) => boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  userData: null,
  loading: true,
  hasPermission: () => false,
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeDoc: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (unsubscribeDoc) {
        unsubscribeDoc();
        unsubscribeDoc = null;
      }
      
      if (user) {
        window.setTimeout(() => {
          void registerFcmToken(user.uid, true);
        }, 2500);

        const userDocRef = doc(db, 'users', user.uid);
        unsubscribeDoc = onSnapshot(userDocRef, (snap) => {
          if (snap.exists()) {
            setUserData({ uid: user.uid, ...snap.data() } as UserData);
          } else {
            // Default to client if no document found, or guest
            setUserData({
              uid: user.uid,
              email: user.email || '',
              displayName: user.displayName || 'Usuario',
              role: 'client'
            });
          }
          setLoading(false);
        }, (error) => {
          console.error("Error listening to user data:", error);
          setUserData(null);
          setLoading(false);
        });
      } else {
        setUserData(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeDoc) unsubscribeDoc();
    };
  }, []);

  // Staff: pedir permiso de notificaciones y reintentar FCM al volver a la pestaña
  useEffect(() => {
    if (!currentUser || !userData) return;
    const isStaff = userData.role === 'owner' || userData.role === 'employee';
    if (!isStaff) return;

    const timer = window.setTimeout(() => {
      void requestNotificationPermission().then(() => {
        void registerFcmToken(currentUser.uid, true);
      });
    }, 3000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void registerFcmToken(currentUser.uid, true);
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [currentUser, userData]);

  const hasPermission = (permission: keyof NonNullable<UserData['permissions']>) => {
    if (!userData) return false;
    if (userData.role === 'owner') return true; // Owner has all permissions
    if (userData.role === 'employee' && userData.permissions) {
      return !!userData.permissions[permission];
    }
    return false;
  };

  const logout = async () => {
    if (currentUser) {
      await unregisterFcmToken(currentUser.uid).catch(() => {});
    }
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ currentUser, userData, loading, hasPermission, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
