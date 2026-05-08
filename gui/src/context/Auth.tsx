import {
  ProfileDescription,
  SerializedOrgWithProfiles,
} from "core/config/ProfileLifecycleManager";
import { ControlPlaneSessionInfo } from "core/control-plane/AuthTypes";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { login as apiLogin } from "../api";
import { LoginDialog } from "../components/dialogs/LoginDialog";
import { useWebviewListener } from "../hooks/useWebviewListener";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { setConfigLoading } from "../redux/slices/configSlice";
import {
  selectCurrentOrg,
  selectSelectedProfile,
  setOrganizations,
  setSelectedOrgId,
} from "../redux/slices/profilesSlice";
import { newSession } from "../redux/slices/sessionSlice";
import {
  setDialogMessage,
  setShowDialog,
  setShowDialogCloseButton,
} from "../redux/slices/uiSlice";
import {
  loadLastSession,
  refreshSessionMetadata,
} from "../redux/thunks/session";
import { getLocalStorage, setLocalStorage } from "../util/localStorage";
import { IdeMessengerContext } from "./IdeMessenger";

interface AuthContextType {
  session: ControlPlaneSessionInfo | undefined;
  logout: () => void;
  login: (useOnboarding: boolean, isRequired?: boolean) => Promise<boolean>;
  selectedProfile: ProfileDescription | null;
  profiles: ProfileDescription[] | null;
  refreshProfiles: (reason?: string) => Promise<void>;
  organizations: SerializedOrgWithProfiles[];
  isAuthReady: boolean;
  isLoginDialogOpen: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const dispatch = useAppDispatch();
  const ideMessenger = useContext(IdeMessengerContext);
  const navigate = useNavigate();
  // Session
  const [session, setSession] = useState<ControlPlaneSessionInfo | undefined>(
    undefined,
  );
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false);

  // Orgs
  const orgs = useAppSelector((store) => store.profiles.organizations);

  // Profiles
  const currentOrg = useAppSelector(selectCurrentOrg);
  const selectedProfile = useAppSelector(selectSelectedProfile);

  const login: AuthContextType["login"] = async (
    useOnboarding: boolean,
    isRequired: boolean = false,
  ) => {
    return new Promise((resolve) => {
      const handleLogin = async (username: string, password: string) => {
        try {
          console.log("[Auth] Starting login process...");

          // Use centralized API login function
          const data = await apiLogin(username, password);
          console.log("[Auth] Login API successful:", data);

          // Get user_name, access_token, and refresh_token from response
          const userName = data.user_name;
          const accessToken = data.access_token;
          const refreshToken = data.refresh_token;

          // Store tokens and user session persistently
          if (accessToken) {
            console.log("[Auth] Storing tokens and session...");
            // Store access_token as plain string (not JSON) for compatibility with core
            localStorage.setItem("access_token", accessToken);
            // Store refresh_token
            localStorage.setItem("refresh_token", refreshToken);
            // Store user session as JSON
            setLocalStorage("user_session", {
              username,
              user_name: userName || "no user_name",
            });

            // Verify storage (important for IntelliJ JCEF environment)
            const storedToken = localStorage.getItem("access_token");
            const storedRefreshToken = localStorage.getItem("refresh_token");
            const storedSession = getLocalStorage("user_session");
            console.log(
              "[Auth] Verification - Access token stored:",
              !!storedToken,
            );
            console.log(
              "[Auth] Verification - Refresh token stored:",
              !!storedRefreshToken,
            );
            console.log(
              "[Auth] Verification - Session stored:",
              !!storedSession,
            );

            if (!storedToken || !storedRefreshToken || !storedSession) {
              console.error(
                "[Auth] CRITICAL: localStorage failed to persist data!",
              );
              throw new Error("Failed to store authentication data");
            }
          }

          // Create a mock session to indicate logged in state
          // label: 로그인할 때 입력한 ID (username)
          // id: 서버에서 받은 user_name
          console.log("[Auth] Setting session state...");
          setSession({
            account: {
              label: username, // 입력한 ID
              id: userName || "no user_name", // 서버에서 받은 user_name
            },
          } as ControlPlaneSessionInfo);

          // Set auth ready state to prevent re-triggering login
          setIsAuthReady(true);

          // Close dialog
          console.log("[Auth] Closing login dialog...");
          setIsLoginDialogOpen(false);
          // Notify extension that login dialog is closed
          ideMessenger.post("setLoginDialogOpen", false);
          dispatch(setShowDialog(false));
          dispatch(setShowDialogCloseButton(true));

          // Small delay to ensure dialog is fully closed before navigation
          await new Promise((resolve) => setTimeout(resolve, 100));

          ideMessenger.post("showToast", ["info", "Login successful!"]);

          // Load last session instead of creating new session
          console.log("[Auth] Loading last session...");
          try {
            await dispatch(loadLastSession());
          } catch (sessionError) {
            console.warn(
              "[Auth] Failed to load last session, creating new session:",
              sessionError,
            );
            // Fallback to new session if loading last session fails
            await dispatch(newSession(undefined));
          }

          // Reload session list and wait for it to complete
          console.log("[Auth] Refreshing session metadata...");
          try {
            await dispatch(refreshSessionMetadata({}));
          } catch (sessionError) {
            console.warn(
              "[Auth] Failed to refresh session metadata (non-critical):",
              sessionError,
            );
            // Continue anyway - this is not critical for login
          }

          // Navigate to chat page
          console.log("[Auth] Navigating to /chat...");
          navigate("/chat");

          console.log("[Auth] Login process completed successfully");
          resolve(true);
        } catch (error: any) {
          console.error("[Auth] Login request failed:", error);
          console.error("[Auth] Error details:", {
            message: error.message,
            status: error.status,
            stack: error.stack,
          });
          throw error;
        }
      };

      // Show login dialog with unique key to force remount and clear previous input
      setIsLoginDialogOpen(true);
      // Notify extension that login dialog is open
      ideMessenger.post("setLoginDialogOpen", true);
      dispatch(
        setDialogMessage(
          <LoginDialog
            key={Date.now()}
            onLogin={handleLogin}
            isRequired={isRequired}
          />,
        ),
      );
      dispatch(setShowDialogCloseButton(false));
      dispatch(setShowDialog(true));
    });
  };

  const logout = () => {
    ideMessenger.post("logoutOfControlPlane", undefined);
    dispatch(setOrganizations(orgs.filter((org) => org.id === "personal")));
    dispatch(setSelectedOrgId("personal"));
    setSession(undefined);
    // Clear all tokens and user session
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setLocalStorage("user_session", undefined as any);
    // Trigger login again
    login(false, true);
  };

  useEffect(() => {
    // Check for existing login on app start
    const initAuth = async () => {
      console.log("[Auth] Initializing auth...");

      // Get access_token as plain string (not JSON)
      const accessToken = localStorage.getItem("access_token");
      const userSession = getLocalStorage("user_session");

      if (accessToken && userSession) {
        // Restore session from localStorage
        console.log("[Auth] Restoring session from localStorage");
        setSession({
          account: {
            label: userSession.username,
            id: userSession.user_name,
          },
        } as ControlPlaneSessionInfo);
        setIsAuthReady(true);
        // Note: loadLastSession and loadRemoteModels are now called from Chat.tsx on first access
      } else {
        // No login info - force login
        console.log("[Auth] No existing session, triggering login");
        setIsAuthReady(true);
        await login(false, true);
      }
    };

    initAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run once on mount

  useWebviewListener(
    "sessionUpdate",
    async (data) => {
      setSession(data.sessionInfo);
    },
    [],
  );

  // Listen for 401 logout events
  useEffect(() => {
    const handleLogout = () => {
      logout();
    };

    window.addEventListener("auth:logout", handleLogout);
    return () => {
      window.removeEventListener("auth:logout", handleLogout);
    };
  }, [logout]);

  const refreshProfiles = useCallback(
    async (reason?: string) => {
      try {
        dispatch(setConfigLoading(true));
        await ideMessenger.request("config/refreshProfiles", {
          reason,
        });
        ideMessenger.post("showToast", ["info", "Config refreshed"]);
      } catch (e) {
        console.error("Failed to refresh profiles", e);
        ideMessenger.post("showToast", ["error", "Failed to refresh config"]);
      } finally {
        dispatch(setConfigLoading(false));
      }
    },
    [ideMessenger],
  );

  return (
    <AuthContext.Provider
      value={{
        session,
        logout,
        login,
        selectedProfile,
        profiles: currentOrg?.profiles ?? [],
        refreshProfiles,
        organizations: orgs,
        isAuthReady,
        isLoginDialogOpen,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
