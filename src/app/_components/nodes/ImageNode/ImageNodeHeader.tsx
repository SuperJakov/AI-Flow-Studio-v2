import {
  Lock,
  LockOpen,
  Play,
  Square,
  AlertCircle,
  Image as ImageIcon,
} from "lucide-react";
import { PopoverTrigger } from "~/components/ui/popover";
import { IMAGE_STYLES } from "./constants";
import { isNodeExecutable } from "~/execution/executionLogic";
import { useAtom } from "jotai";
import { edgesAtom, nodesAtom } from "~/app/whiteboard/atoms";

interface ImageNodeHeaderProps {
  id: string;
  isLocked: boolean;
  isRunning: boolean;
  hasIncomingConnections: boolean;
  isRateLimited: boolean;
  selectedStyle?: string;
  onToggleLock: (
    event: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => void;
  onToggleRunning: (
    event: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => void;
  onStylePopoverTrigger: (
    event: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => void;
}

export function ImageNodeHeader({
  isLocked,
  isRunning,
  hasIncomingConnections,
  isRateLimited,
  selectedStyle,
  onToggleLock,
  onToggleRunning,
  onStylePopoverTrigger,
  id,
}: ImageNodeHeaderProps) {
  const currentStyle =
    IMAGE_STYLES.find((s) => s.id === selectedStyle) ?? IMAGE_STYLES[0];
  const CurrentIcon = currentStyle.icon;

  const [nodes] = useAtom(nodesAtom);
  const [edges] = useAtom(edgesAtom);
  const thisNode = nodes.find((n) => n.id === id);
  if (!thisNode) return null;
  const isNodeExecutableResult = isNodeExecutable(thisNode, edges);

  return (
    <div className="flex items-center justify-between px-1 py-2">
      <div className="flex items-center text-black">
        <ImageIcon size={18} className="mx-1" />
        <span className="mr-2 font-medium">Image</span>
        <PopoverTrigger asChild>
          <button
            className="cursor-pointer rounded p-1 text-gray-700 hover:bg-gray-500/20 hover:text-gray-900"
            onClick={onStylePopoverTrigger}
          >
            <CurrentIcon size={18} />
          </button>
        </PopoverTrigger>
      </div>
      <div className="flex items-center space-x-2">
        <button
          className="cursor-pointer rounded p-1 text-gray-700 hover:bg-gray-500/20 hover:text-gray-900"
          onClick={onToggleLock}
        >
          {isLocked ? <Lock size={18} /> : <LockOpen size={18} />}
        </button>
        <button
          className={`cursor-pointer rounded p-1 ${
            isNodeExecutableResult.isExecutable
              ? "text-gray-700 hover:bg-gray-500/20 hover:text-gray-900"
              : "cursor-not-allowed text-gray-400"
          }`}
          onClick={onToggleRunning}
          title={
            isNodeExecutableResult.isExecutable
              ? isRunning
                ? "Stop Node"
                : "Run Node"
              : `Cannot run: ${isNodeExecutableResult.reason ?? "Unknown reason"}`
          }
          disabled={!isNodeExecutableResult.isExecutable}
        >
          {isRunning ? (
            <Square size={18} />
          ) : isNodeExecutableResult.isExecutable ? (
            <Play size={18} fill="currentColor" />
          ) : (
            <AlertCircle size={18} />
          )}
        </button>
      </div>
    </div>
  );
}
