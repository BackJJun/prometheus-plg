import {
  CheckCircleIcon,
  Cog6ToothIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { useContext, useState } from "react";
import { checkHealth } from "../../../api/client";
import { AssistantIcon } from "../../../components/AssistantAndOrgListbox/AssistantIcon";
import { ToolTip } from "../../../components/gui/Tooltip";
import { Button, Card, Divider, EmptyState } from "../../../components/ui";
import { useAuth } from "../../../context/Auth";
import { IdeMessengerContext } from "../../../context/IdeMessenger";
import { useAppSelector } from "../../../redux/hooks";
import { ConfigHeader } from "../components/ConfigHeader";

function getLocalPrometheusConfigUri(): string {
  const rawPath =
    process.platform === "win32"
      ? `${process.env.USERPROFILE}\\.prometheus\\config.yaml`
      : `${process.env.HOME}/.prometheus/config.yaml`;

  if (process.platform === "win32") {
    return `file:///${rawPath.replace(/\\/g, "/")}`;
  }

  return `file://${rawPath}`;
}

export function ConfigsSection() {
  const { profiles, selectedProfile } = useAuth();
  const configError = useAppSelector((state) => state.config.configError);
  const ideMessenger = useContext(IdeMessengerContext);
  const [healthStatus, setHealthStatus] = useState<
    "idle" | "checking" | "success" | "error"
  >("idle");
  const [healthMessage, setHealthMessage] = useState<string>("");

  // Filter out MCP server errors - only show config.yaml errors
  function isConfigYamlError(error: any): boolean {
    // If error message contains MCP server file path, it's not a config.yaml error
    if (
      error.message?.includes("/mcpServers/") ||
      error.message?.includes("\\mcpServers\\")
    ) {
      return false;
    }
    return true;
  }

  async function handleAddConfig() {
    ideMessenger.post("showFile", {
      filepath: getLocalPrometheusConfigUri(),
    });
  }

  async function handleHealthCheck() {
    setHealthStatus("checking");
    setHealthMessage("");

    try {
      const result = await checkHealth();
      setHealthStatus("success");
      setHealthMessage(result.status || "Server is healthy");

      // Auto-hide success message after 3 seconds
      setTimeout(() => {
        if (healthStatus === "success") {
          setHealthStatus("idle");
          setHealthMessage("");
        }
      }, 3000);
    } catch (error: any) {
      setHealthStatus("error");
      setHealthMessage(error.message || "Health check failed");
    }
  }

  return (
    <>
      <ConfigHeader
        title="Configs"
        onAddClick={handleAddConfig}
        addButtonTooltip="Open config.yaml"
      />

      {/* Health Check Section */}
      <Card className="mb-4">
        <div className="flex items-center justify-between gap-3 p-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-medium">Server Health</h3>
            {healthStatus === "success" && (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircleIcon className="h-4 w-4" />
                <span className="text-xs">{healthMessage}</span>
              </div>
            )}
            {healthStatus === "error" && (
              <div className="text-error flex items-center gap-2">
                <XCircleIcon className="h-4 w-4" />
                <span className="text-xs">{healthMessage}</span>
              </div>
            )}
          </div>
          <Button
            onClick={handleHealthCheck}
            disabled={healthStatus === "checking"}
            variant="outline"
            size="sm"
          >
            {healthStatus === "checking" ? "Checking..." : "Check Health"}
          </Button>
        </div>
      </Card>

      <Card>
        {profiles && profiles.length > 0 ? (
          profiles.map((profile, index) => {
            const isSelected = profile.id === selectedProfile?.id;
            // Filter to only show config.yaml errors, not MCP server errors
            const allErrors = isSelected ? configError : profile.errors;
            const errors = allErrors?.filter(isConfigYamlError);
            const hasFatalErrors =
              errors && errors.some((error) => error.fatal);
            const hasErrors = errors && errors.length > 0;
            return (
              <div key={profile.id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-baseline gap-3">
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center">
                      <AssistantIcon assistant={profile} />
                    </div>
                    <div className="flex flex-1 flex-col gap-2">
                      <h3
                        className={`my-2 text-sm font-medium ${
                          hasFatalErrors
                            ? "text-error"
                            : hasErrors
                              ? "text-yellow-500"
                              : ""
                        }`}
                      >
                        {profile.title}
                      </h3>
                      {errors && errors.length > 0 && (
                        <div className="space-y-1 overflow-hidden">
                          {errors.map((error, errorIndex) => (
                            <div
                              key={errorIndex}
                              className={`${
                                error.fatal
                                  ? "text-error bg-error/10"
                                  : "bg-yellow-500/10 text-yellow-500"
                              } break-all rounded border border-solid border-transparent px-2 py-1 text-xs`}
                            >
                              {error.message}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <ToolTip content="Edit config.yaml">
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        ideMessenger.post("config/openProfile", {
                          profileId: profile.id,
                        });
                      }}
                      variant="ghost"
                      size="sm"
                      className="text-description-muted hover:enabled:text-foreground my-0 h-6 w-6 p-0"
                    >
                      <Cog6ToothIcon className="h-4 w-4 flex-shrink-0" />
                    </Button>
                  </ToolTip>
                </div>
                {index < profiles.length - 1 && <Divider />}
              </div>
            );
          })
        ) : (
          <EmptyState message="No configs found. Click + to create config.yaml" />
        )}
      </Card>
    </>
  );
}
