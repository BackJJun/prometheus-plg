import { useContext, useEffect, useState } from "react";
import { Card } from "../../../components/ui";
import { IdeMessengerContext } from "../../../context/IdeMessenger";

interface ApiModel {
  id: number;
  model_id: string;
  model_name: string;
  model_class: string;
  model_provider: string;
  model_roles: string;
  api_base_url: string | null;
  is_active: boolean;
  open_source_yn: string;
}

export function ApiModelsTable() {
  const ideMessenger = useContext(IdeMessengerContext);
  const [models, setModels] = useState<ApiModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchModels() {
      try {
        setLoading(true);
        const accessToken = localStorage.getItem("access_token");

        if (!accessToken) {
          setError("Not logged in");
          setLoading(false);
          return;
        }

        // Use ideMessenger to fetch models
        const result = await ideMessenger.request("models/list", {
          accessToken,
        });

        if (result.status === "success") {
          setModels(result.content || []);
        } else {
          setError(result.error || "Failed to load models");
        }
      } catch (err: any) {
        setError(err.message || "Failed to load models");
      } finally {
        setLoading(false);
      }
    }

    void fetchModels();
  }, [ideMessenger]);

  const parseRoles = (rolesString: string): string[] => {
    try {
      return JSON.parse(rolesString);
    } catch {
      return [];
    }
  };

  if (loading) {
    return (
      <Card>
        <div className="text-description-muted p-4 text-center">
          Loading models...
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <div className="text-error p-4 text-center">Error: {error}</div>
      </Card>
    );
  }

  if (models.length === 0) {
    return (
      <Card>
        <div className="text-description-muted p-4 text-center">
          No models available
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border border-b">
              <th className="text-foreground px-4 py-3 text-left font-medium">
                Model Name
              </th>
              <th className="text-foreground px-4 py-3 text-left font-medium">
                Provider
              </th>
              <th className="text-foreground px-4 py-3 text-left font-medium">
                Model ID
              </th>
              <th className="text-foreground px-4 py-3 text-left font-medium">
                Roles
              </th>
              <th className="text-foreground px-4 py-3 text-left font-medium">
                API Base
              </th>
              <th className="text-foreground px-4 py-3 text-left font-medium">
                Status
              </th>
              <th className="text-foreground px-4 py-3 text-left font-medium">
                Type
              </th>
            </tr>
          </thead>
          <tbody>
            {models.map((model) => (
              <tr
                key={model.id}
                className="border-border hover:bg-background-secondary border-b last:border-b-0"
              >
                <td className="text-foreground px-4 py-3 font-medium">
                  {model.model_name}
                </td>
                <td className="text-description-muted px-4 py-3">
                  {model.model_provider}
                </td>
                <td className="text-description-muted px-4 py-3 font-mono text-xs">
                  {model.model_id}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {parseRoles(model.model_roles).map((role) => (
                      <span
                        key={role}
                        className="bg-background-secondary text-foreground rounded px-2 py-0.5 text-xs"
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="text-description-muted px-4 py-3 font-mono text-xs">
                  {model.api_base_url || (
                    <span className="italic">Provider default</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      model.is_active
                        ? "bg-green-500/10 text-green-500"
                        : "bg-red-500/10 text-red-500"
                    }`}
                  >
                    {model.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      model.open_source_yn === "y"
                        ? "bg-blue-500/10 text-blue-500"
                        : "bg-purple-500/10 text-purple-500"
                    }`}
                  >
                    {model.open_source_yn === "y"
                      ? "Open Source"
                      : "Proprietary"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
