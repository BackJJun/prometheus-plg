import { EllipsisHorizontalIcon } from "@heroicons/react/24/outline";
import { LLMInteraction } from "../../hooks/useLLMLog";

export interface StatusIconProps {
  interaction: LLMInteraction;
}

export default function StatusIcon({ interaction }: StatusIconProps) {
  if (!interaction.end) {
    return (
      <EllipsisHorizontalIcon className="relative top-[2px] -mt-[2px] h-[16px] w-[16px] pr-[2px]" />
    );
  }

  return <span className="inline-block h-[16px] w-[16px] pr-[2px]" />;
}
