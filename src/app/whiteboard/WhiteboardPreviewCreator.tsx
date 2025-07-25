"use client";

import { useReactFlow, getViewportForBounds } from "@xyflow/react";
import { toPng } from "html-to-image";
import { useAtom } from "jotai";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { currentWhiteboardIdAtom, edgesAtom, nodesAtom } from "./atoms";
import { useConvexQuery } from "~/helpers/convex";

// Define constants for the generated image dimensions
const IMAGE_WIDTH = 1365;
const IMAGE_HEIGHT = 768;
const DEBOUNCE_DELAY = 5000; // 5 seconds

/**
 * A utility function to convert a data URL string to a Blob object.
 * @param {string} dataUrl - The data URL to convert.
 * @returns {Blob} The resulting Blob.
 */
function dataURLtoBlob(dataUrl: string): Blob {
  // Only log on error
  const arr = dataUrl.split(",");
  const mimeMatch = arr[0]?.match(/:(.*?);/);
  if (!mimeMatch) {
    console.error("[WhiteboardPreviewCreator] Invalid data URL format.");
    throw new Error("Invalid data URL format.");
  }
  const mime = mimeMatch[1];
  if (!arr[1]) {
    console.error(
      "[WhiteboardPreviewCreator] Invalid data URL format: missing base64 data.",
    );
    throw new Error("Invalid data URL format: missing base64 data.");
  }
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

type Props = {
  id: string;
};

/**
 * A headless React component responsible for automatically generating and uploading
 * a preview image of a whiteboard whenever its content changes.
 */
export default function WhiteboardPreviewCreator({ id }: Props) {
  const { getNodesBounds } = useReactFlow();
  const [nodes] = useAtom(nodesAtom);
  const [edges] = useAtom(edgesAtom);
  const [whiteboardId] = useAtom(currentWhiteboardIdAtom);
  const uploadPreviewImage = useMutation(api.whiteboards.uploadPreviewImage);
  const whiteboardData = useConvexQuery(
    api.whiteboards.getWhiteboard,
    id ? { id } : "skip",
  );
  const user = useConvexQuery(api.users.current);

  const isSharedWhiteboard =
    whiteboardData?.isPublic && whiteboardData?.ownerId !== user?.externalId;

  // Convex mutation to get a secure URL for uploading the preview image.
  const generatePreviewUploadUrl = useMutation(
    api.whiteboards.generatePreviewUploadUrl,
  );

  // Ref to hold the timeout ID for debouncing the preview generation.
  // Using ReturnType<typeof setTimeout> for type safety in browser/node environments.
  const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Uploads the generated image data to the storage URL provided by the backend.
   * Memoized with useCallback to maintain a stable function reference.
   */
  const uploadImage = useCallback(
    async (imageDataUrl: string) => {
      if (!whiteboardId) {
        console.error(
          "[WhiteboardPreviewCreator] Upload failed: Whiteboard ID is not defined.",
        );
        return;
      }
      try {
        const uploadUrl = await generatePreviewUploadUrl({
          whiteboardId: whiteboardId,
        });
        if (!uploadUrl) {
          throw new Error("Failed to get a pre-signed upload URL.");
        }
        const imageBlob = dataURLtoBlob(imageDataUrl);
        const previewImageFile = new File(
          [imageBlob],
          "whiteboard-preview.png",
          {
            type: "image/png",
          },
        );
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": previewImageFile.type },
          body: previewImageFile,
        });
        if (!result.ok) {
          throw new Error(
            `[WhiteboardPreviewCreator] Image upload failed with status: ${result.status}`,
          );
        }
        const responseJson: unknown = await result.json();
        if (typeof responseJson !== "object" || responseJson === null) {
          throw new Error(
            "[WhiteboardPreviewCreator] Invalid response from upload endpoint.",
          );
        }
        if (
          !("storageId" in responseJson) ||
          typeof responseJson.storageId !== "string"
        ) {
          throw new Error(
            "[WhiteboardPreviewCreator] Invalid response from upload endpoint.",
          );
        }
        await uploadPreviewImage({
          previewImageStorageId: responseJson.storageId as Id<"_storage">, // we can safely assert
          whiteboardId: whiteboardId,
        });
        console.log(
          "[WhiteboardPreviewCreator] Successfully uploaded whiteboard preview.",
        );
      } catch (error) {
        console.error(
          "[WhiteboardPreviewCreator] An error occurred during image upload:",
          error,
        );
      }
    },
    [whiteboardId, generatePreviewUploadUrl, uploadPreviewImage],
  );

  /**
   * This effect sets up the debounced call to generate a preview.
   * It triggers after a delay whenever the whiteboard content (nodes or edges)
   * or the whiteboardId changes.
   */
  useEffect(() => {
    if (!whiteboardId || isSharedWhiteboard) {
      return undefined;
    }

    const generatePreview = async () => {
      const reactFlowViewport = document.querySelector<HTMLElement>(
        ".react-flow__viewport",
      );
      if (!reactFlowViewport) {
        console.error(
          "[WhiteboardPreviewCreator] Could not find the .react-flow__viewport element to capture.",
        );
        return;
      }
      try {
        if (nodes.length === 0) {
          return;
        }
        const nodesBounds = getNodesBounds(nodes);
        const viewport = getViewportForBounds(
          nodesBounds,
          IMAGE_WIDTH,
          IMAGE_HEIGHT,
          0.5, // minZoom
          2, // maxZoom
          0.1, // padding
        );
        const imageDataUrl = await toPng(reactFlowViewport, {
          backgroundColor: "#111827", // bg-gray-900,
          width: IMAGE_WIDTH,
          height: IMAGE_HEIGHT,
          style: {
            width: `${IMAGE_WIDTH}px`,
            height: `${IMAGE_HEIGHT}px`,
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          },
          cacheBust: true,
        });
        await uploadImage(imageDataUrl);
      } catch (error) {
        console.error(
          "[WhiteboardPreviewCreator] Failed to generate whiteboard preview:",
          error,
        );
      }
    };

    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
    debounceTimeout.current = setTimeout(() => {
      void (async () => {
        await generatePreview();
      })();
    }, DEBOUNCE_DELAY);
    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, [
    whiteboardId,
    nodes,
    edges,
    uploadImage,
    getNodesBounds,
    isSharedWhiteboard,
  ]);

  // This component does not render any UI itself.
  return null;
}
