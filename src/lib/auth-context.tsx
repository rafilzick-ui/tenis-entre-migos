import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import type { Profile, UserRole } from "@/lib/auth-types";

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase.rpc("get_own_profile");
      if (error) {
        console.error("Failed to load profile:", error.message);
        return null;
      }
      if (!data) {
        setProfile(null);
        return null;
      }
      const p = data as Record<string, unknown>;
      const profileData: Profile = {
        id: p.id as string,
        email: p.email as string,
        full_name: p.full_name as string,
        display_name: p.display_name as string,
        phone: p.phone as string | null,
        avatar_url: p.avatar_url as string | null,
        role: p.role as UserRole,
        skill_level: (p.skill_level as number) ?? 1,
        created_at: p.created_at as string,
      };
      setProfile(profileData);
      return profileData;
    } catch (err) {
      console.error("Profile load exception:", err);
      return null;
    }
  }, [supabase]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;
    let profileLoaded = false;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user && !profileLoaded) {
        profileLoaded = true;
        loadProfile(data.session.user.id).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!mounted) return;
        setSession(newSession);
        if (newSession?.user) {
          if (!profileLoaded) {
            profileLoaded = true;
            setLoading(true);
            loadProfile(newSession.user.id).finally(() => {
              if (mounted) setLoading(false);
            });
          }
        } else {
          profileLoaded = false;
          setProfile(null);
          setLoading(false);
        }
      },
    );

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [supabase, loadProfile]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
