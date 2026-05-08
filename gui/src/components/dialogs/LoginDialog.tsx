import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import {
  Cog6ToothIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import React, { useContext, useEffect, useState } from "react";
import { checkHealth, getApiBaseUrl } from "../../api/client";
import { IdeMessengerContext } from "../../context/IdeMessenger";
import { useAppSelector } from "../../redux/hooks";
import { Button } from "../ui";

interface LoginDialogProps {
  onLogin: (username: string, password: string) => Promise<void>;
  isRequired?: boolean;
}

export function LoginDialog({ onLogin, isRequired = false }: LoginDialogProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<
    "idle" | "checking" | "success" | "error"
  >("idle");
  const [healthMessage, setHealthMessage] = useState<string>("");
  const [serverUrl, setServerUrl] = useState<string>("");
  const [lastCheckTime, setLastCheckTime] = useState<string>("");
  const ideMessenger = useContext(IdeMessengerContext);
  const configError = useAppSelector((state) => state.config.configError);

  // Filter out MCP server errors - only show config.yaml errors
  function isConfigYamlError(error: any): boolean {
    if (
      error.message?.includes("/mcpServers/") ||
      error.message?.includes("\\mcpServers\\")
    ) {
      return false;
    }
    return true;
  }

  const configYamlErrors = configError?.filter(isConfigYamlError);
  const hasConfigErrors = configYamlErrors && configYamlErrors.length > 0;

  // Reset form fields when component mounts (e.g., after logout or token expiration)
  useEffect(() => {
    setUsername("");
    setPassword("");
    setError(null);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await onLogin(username, password);
      setUsername("");
      setPassword("");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleHealthCheck = async () => {
    setHealthStatus("checking");
    setHealthMessage("");

    try {
      const result = await checkHealth();
      setHealthStatus("success");
      setHealthMessage(result.status || "Server is healthy");
      setServerUrl(getApiBaseUrl());
      setLastCheckTime(new Date().toLocaleTimeString());

      setServerUrl(getApiBaseUrl());
      setLastCheckTime(new Date().toLocaleTimeString());

      // No timeout - keep result visible
    } catch (error: any) {
      setHealthStatus("error");
      setHealthMessage(error.message || "Health check failed");
      setServerUrl(getApiBaseUrl());
      setLastCheckTime(new Date().toLocaleTimeString());
    }
  };

  const handleOpenConfig = () => {
    ideMessenger.post("config/openProfile", {
      profileId: undefined,
    });
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Prometheus 로고와 타이틀 */}
      <div className="flex items-center gap-3 pb-2">
        <img
          src={`${window.vscMediaUrl || ""}/logos/prometheus_logo_gray.png`}
          alt="Prometheus Logo"
          className="h-10 w-10"
        />
        <h2 className="text-xl font-bold">Prometheus</h2>
      </div>

      {/* Config Error Display */}
      {hasConfigErrors && (
        <div className="rounded-md border border-yellow-600/50 bg-yellow-600/10 p-3">
          <div className="flex items-start gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0 text-yellow-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-600">
                Error loading Local Config
              </p>
              <p className="mt-1 text-xs text-yellow-600/90">
                Please check config.yaml format and fix validation errors.
              </p>
              <Button
                type="button"
                onClick={handleOpenConfig}
                variant="outline"
                size="sm"
                className="mt-2"
              >
                Open Config
              </Button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="username" className="text-sm">
            Username
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="bg-vsc-input-background text-vsc-foreground border-border focus:border-border-focus rounded-md border border-solid px-3 py-2 text-sm outline-none"
            required
            autoFocus
            disabled={isLoading}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-vsc-input-background text-vsc-foreground border-border focus:border-border-focus rounded-md border border-solid px-3 py-2 text-sm outline-none"
            required
            disabled={isLoading}
          />
        </div>

        {error && <div className="text-sm text-red-500">{error}</div>}

        <div className="mt-2 flex justify-end gap-2">
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? "Logging in..." : "Login"}
          </Button>
        </div>
      </form>

      {/* Utility Buttons Section - Dashboard Popover */}
      <div className="border-border flex flex-col gap-2 border-t pt-3">
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0 flex-1">{/* Left side empty */}</div>

          <Popover className="relative">
            {({ close }) => (
              <>
                <PopoverButton
                  as={Button}
                  variant="outline"
                  size="sm"
                  className="flex shrink-0 items-center gap-1.5"
                >
                  <Cog6ToothIcon className="h-4 w-4" />
                  <span>Config</span>
                </PopoverButton>

                <PopoverPanel className="bg-vsc-background border-border absolute -right-4 bottom-full z-10 mb-2 flex w-80 flex-col overflow-hidden rounded-xl border border-solid p-3 shadow-2xl ring-1 ring-black/10 focus:outline-none">
                  <div className="mb-4 flex items-center justify-between px-1">
                    <span className="text-description text-xs font-semibold uppercase tracking-wider">
                      Config
                    </span>
                    <button
                      onClick={() => close()}
                      className="text-description hover:text-vsc-foreground rounded bg-transparent p-0.5"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Server Status Card */}
                  <div className="border-border mb-3 rounded-lg border border-solid p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-foreground text-sm font-medium">
                        Server Status
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent closing popover
                          handleHealthCheck();
                        }}
                        disabled={healthStatus === "checking"}
                        className="text-link hover:text-link rounded bg-transparent px-2 text-xs disabled:opacity-50"
                        title="Check Status"
                      >
                        Check
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="relative flex h-3 w-3">
                        {(healthStatus === "checking" ||
                          healthStatus === "success") && (
                          <span
                            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                              healthStatus === "success"
                                ? "bg-green-400"
                                : "bg-blue-400"
                            }`}
                          ></span>
                        )}
                        <span
                          className={`relative inline-flex h-3 w-3 rounded-full ${
                            healthStatus === "success"
                              ? "bg-green-500"
                              : healthStatus === "error"
                                ? "bg-red-500"
                                : healthStatus === "checking"
                                  ? "bg-blue-500"
                                  : "bg-gray-500"
                          }`}
                        ></span>
                      </div>
                      <span className="text-description truncate text-xs">
                        {healthStatus === "checking"
                          ? "Checking connection..."
                          : healthStatus === "success"
                            ? "Connected to Server"
                            : healthStatus === "error"
                              ? healthMessage
                              : "확인전"}
                      </span>
                    </div>
                    {(healthStatus === "success" ||
                      healthStatus === "error") && (
                      <div className="text-description mt-2 pl-5 text-[10px]">
                        {serverUrl} |{" "}
                        {healthStatus === "success" ? "OK" : "Error"} |{" "}
                        {lastCheckTime}
                      </div>
                    )}
                  </div>

                  {/* Config Card */}
                  <button
                    type="button"
                    onClick={(e) => {
                      // e.stopPropagation(); // Keep open
                      handleOpenConfig();
                    }}
                    className="hover:border-border hover:bg-vsc-input-background group flex w-full cursor-pointer flex-col rounded-lg border border-solid border-transparent bg-transparent p-2 text-left transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <Cog6ToothIcon className="text-foreground h-4 w-4 opacity-70 transition-opacity group-hover:opacity-100" />
                      <span className="text-foreground text-sm font-medium">
                        Open Config file
                      </span>
                    </div>
                    <span className="text-description group-hover:text-vsc-foreground text-2xs mt-1 pl-6">
                      Edit config.yaml settings
                    </span>
                  </button>
                </PopoverPanel>
              </>
            )}
          </Popover>
        </div>
      </div>
    </div>
  );
}
