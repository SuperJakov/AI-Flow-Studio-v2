// src/core/execution/InstructionNodeExecutor.ts

import type { IExecutor, ExecutionContext } from "./types";
import type { InstructionNodeType, AppNode, AppEdge } from "~/Types/nodes";
import { v4 as uuidv4 } from "uuid";
import { nodesAtom, edgesAtom } from "~/app/whiteboard/atoms";
import { getDefaultNodeData } from "~/execution/executionLogic";

class InstructionNodeExecutor implements IExecutor {
  canExecute({ currentNode }: ExecutionContext): boolean {
    return currentNode.type === "instruction";
  }

  async execute({
    get,
    set,
    currentNode,
    sourceNodes,
  }: ExecutionContext): Promise<void> {
    console.groupCollapsed(
      `InstructionNodeExecutor: Executing for node ${currentNode.id}`,
    );
    const instructionNode = currentNode as InstructionNodeType;

    try {
      const instruction = instructionNode.data.text;
      const inputNodeTypes = sourceNodes
        .filter(
          (node) =>
            node.type === "textEditor" ||
            node.type === "image" ||
            node.type === "speech",
        )
        .map((node) => node.type);
      const imageSource = sourceNodes.find((node) => node.type === "image");

      const { detectOutputNodeTypeAction } =
        instructionNode.data?.internal ?? {};
      if (!detectOutputNodeTypeAction) {
        throw new Error("detectOutputNodeTypeAction is undefined");
      }

      const outputNodeTypeRaw = await detectOutputNodeTypeAction({
        instruction,
        inputNodeTypes,
      });
      const outputNodeType =
        outputNodeTypeRaw === "texteditor" ? "textEditor" : outputNodeTypeRaw;

      const newNodeId = uuidv4();
      const styleToUse =
        outputNodeType === "image" && imageSource?.type === "image"
          ? imageSource.data.style
          : "auto";
      const newNode = {
        id: newNodeId,
        type: outputNodeType,
        position: {
          x: instructionNode.position.x,
          y: instructionNode.position.y + 300,
        },
        data: {
          ...getDefaultNodeData(outputNodeType),
          ...(outputNodeType === "image" && { style: styleToUse }),
        },
        ...(outputNodeType === "textEditor" && { width: 270, height: 170 }),
      } as AppNode;

      set(nodesAtom, [...get(nodesAtom), newNode]);

      const newEdge: AppEdge = {
        id: `edge-${instructionNode.id}-${newNodeId}`,
        source: instructionNode.id,
        target: newNodeId,
        type: "default",
      };
      set(edgesAtom, [...get(edgesAtom), newEdge]);
    } catch (error) {
      console.error("Error executing instruction node:", error);
    } finally {
      console.groupEnd();
    }
  }
}

export const instructionNodeExecutor = new InstructionNodeExecutor();
