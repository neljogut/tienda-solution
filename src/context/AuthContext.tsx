import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
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
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (user) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDocSnap = await getDoc(userDocRef);
          
          if (userDocSnap.exists()) {
            setUserData({ uid: user.uid, ...userDocSnap.data() } as UserData);
          } else {
            // Default to client if no document found, or guest
            setUserData({
              uid: user.uid,
              email: user.email || '',
              displayName: user.displayName || 'Usuario',
              role: 'client'
            });
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
          setUserData(null);
        }
      } else {
        setUserData(null);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const hasPermission = (permission: keyof NonNullable<UserData['permissions']>) => {
    if (!userData) return false;
    if (userData.role === 'owner') return true; // Owner has all permissions
    if (userData.role === 'employee' && userData.permissions) {
      return !!userData.permissions[permission];
    }
    return false;
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ currentUser, userData, loading, hasPermission, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
