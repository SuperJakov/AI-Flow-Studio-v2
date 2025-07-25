"use client";
import { type ChangeEvent } from "react";
import { type NodeProps, NodeResizer } from "@xyflow/react";
import type { CommentNodeType } from "~/Types/nodes";
import { useAtom } from "jotai";
import { updateNodeDataAtom } from "~/app/whiteboard/atoms";
import { Lock, LockOpen, MessageSquare } from "lucide-react";

export default function CommentNode({
  data,
  id,
  selected,
}: NodeProps<CommentNodeType>) {
  const { text, isLocked } = data;
  const [, updateNodeData] = useAtom(updateNodeDataAtom);

  const toggleLock = (
    event: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    event.stopPropagation(); // Prevent React Flow from interfering

    updateNodeData({
      nodeId: id,
      nodeType: "comment",
      updatedData: { isLocked: !isLocked },
    });
  };

  const onChange = (evt: ChangeEvent<HTMLTextAreaElement>) => {
    if (evt.target.value.length > 10000 || isLocked) {
      return;
    }
    updateNodeData({
      nodeId: id,
      nodeType: "comment",
      updatedData: { text: evt.target.value },
    });
  };

  return (
    // The main container now uses flexbox to manage the layout and must have h-full
    <div
      className={`flex h-full flex-col overflow-hidden rounded bg-orange-100 shadow-md outline-2 ${
        selected ? "outline-blue-600" : "outline-gray-200"
      }`}
    >
      {/* It's only visible when the node is selected and not locked. */}
      <NodeResizer
        isVisible={selected && !isLocked}
        minWidth={200}
        minHeight={120}
        maxHeight={500}
        maxWidth={500}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1">
        <div className="handle flex cursor-grab items-center text-black">
          <MessageSquare size={18} />
          <span className="ml-2 font-medium">Comment</span>
        </div>
        <button
          onClick={toggleLock}
          className="cursor-pointer rounded p-1 text-black hover:bg-black/10"
          title={isLocked ? "Unlock Comment" : "Lock Comment"}
        >
          {isLocked ? <Lock size={16} /> : <LockOpen size={16} />}
        </button>
      </div>

      <div className="flex-grow bg-orange-200">
        <textarea
          className="nodrag custom-scrollbar h-full w-full resize-none rounded bg-transparent p-2 text-lg font-bold text-black outline-none"
          value={text}
          onChange={onChange}
          placeholder="Add a comment..."
          readOnly={isLocked}
          maxLength={10000}
        />
      </div>
    </div>
  );
}
