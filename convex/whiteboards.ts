import { query } from "./_generated/server";
import { internalMutation, mutation } from "./functions";
import { v } from "convex/values";
import { AppEdge, AppNode } from "./schema";
import { v4 as uuidv4 } from "uuid";
import { api, internal } from "./_generated/api";
import type { Tier } from "~/Types/stripe";

function generateInitialNodes() {
  return [
    {
      type: "textEditor" as const,
      data: {
        isLocked: false,
        text: "This is a text node.",
      },
      id: uuidv4(),
      position: {
        x: 0,
        y: 0,
      },
      width: 280,
      height: 180,
    },
  ];
}

function getWhiteboardCountLimitForTier(tier: Tier) {
  switch (tier) {
    case "Free":
      return 5; // Free tier allows up to 5 whiteboards
    case "Plus":
      return 50; // Plus tier allows up to 50 whiteboards
    case "Pro":
      return Infinity; // Pro tier allows unlimited whiteboards
    default:
      throw new Error(`Unknown tier: ${String(tier)}`);
  }
}

function getNodeCountLimitForTier(tier: Tier) {
  switch (tier) {
    case "Free":
      return 20; // Free tier allows up to 10 node
    case "Plus":
      return 50; // Plus tier allows up to 50 nodes
    case "Pro":
      return 100; // Pro tier allows 100 nodes
    default:
      throw new Error(`Unknown tier: ${String(tier)}`);
  }
}

export const getWhiteboardCountLimit = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userPlanInfo = await ctx.runQuery(api.users.getCurrentUserPlanInfo);
    if (!userPlanInfo) throw new Error("User not found");

    const maxWhiteboards = getWhiteboardCountLimitForTier(userPlanInfo.plan);
    console.log(
      `Calculated max whiteboards ${maxWhiteboards} for user ${identity.subject} with plan ${userPlanInfo.plan}`,
    );

    const usersWhiteboards = await ctx.db
      .query("whiteboards")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", identity.subject))
      .collect();

    if (!usersWhiteboards) {
      throw new Error("Error when listing user's whiteboards");
    }
    return {
      maxWhiteboardCount: maxWhiteboards,
      currentWhiteboardCount: usersWhiteboards.length,
    };
  },
});

export const getNodeCountLimit = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userPlanInfo = await ctx.runQuery(api.users.getCurrentUserPlanInfo);
    if (!userPlanInfo) throw new Error("User not found");

    const nodeCountLimit = getNodeCountLimitForTier(userPlanInfo.plan);

    return {
      maxNodeCount: nodeCountLimit,
    };
  },
});

// --- Create a new whiteboard ---
export const createWhiteboard = mutation({
  args: {
    title: v.string(),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, { title, projectId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const { maxWhiteboardCount, currentWhiteboardCount } = await ctx.runQuery(
      api.whiteboards.getWhiteboardCountLimit,
    );

    if (currentWhiteboardCount + 1 > maxWhiteboardCount) {
      throw new Error(
        `You have reached the limit of ${maxWhiteboardCount} whiteboards for your plan.
      Please delete some whiteboards or upgrade your plan.`,
      );
    }
    if (title && title.length > 30) {
      throw new Error("Title must be at most 30 characters long");
    }

    const now = BigInt(Date.now());
    return await ctx.db.insert("whiteboards", {
      title: title.trim() === "" ? "Untitled Whiteboard" : title,
      createdAt: now,
      updatedAt: now,
      ownerId: identity.subject,
      nodes: generateInitialNodes(),
      edges: [],
      isPublic: false,
      projectId: projectId ?? undefined,
    });
  },
});

// --- Edit whiteboard ---
export const editWhiteboard = mutation({
  args: {
    id: v.string(),
    title: v.optional(v.string()),
    nodes: v.optional(v.array(AppNode)),
    edges: v.optional(v.array(AppEdge)),
  },
  handler: async (ctx, { id, title, nodes, edges }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const normalizedId = ctx.db.normalizeId("whiteboards", id);
    if (!normalizedId) throw new Error("Could not normalize ID.");

    const whiteboard = await ctx.db.get(normalizedId);
    if (!whiteboard) throw new Error("Whiteboard not found");

    if (whiteboard.ownerId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    if (title && title.length > 30) {
      throw new Error("Title must be at most 30 characters long");
    }

    if (nodes) {
      for (const node of nodes) {
        if (
          node.type === "textEditor" ||
          node.type === "comment" ||
          node.type === "instruction"
        ) {
          if (node.data.text.length > 10000) {
            throw new Error(
              "Text content exceeds maximum length of 10000 characters",
            );
          }
        }
      }
      const { maxNodeCount } = await ctx.runQuery(
        api.whiteboards.getNodeCountLimit,
      );
      if (maxNodeCount < nodes.length) {
        throw new Error(
          `"Node count exceeds limit of ${maxNodeCount} nodes for this user`,
        );
      }
    }

    await ctx.db.patch(normalizedId, {
      title: title ?? whiteboard.title ?? undefined,
      nodes: nodes ?? whiteboard.nodes,
      edges: edges ?? whiteboard.edges,
      updatedAt: BigInt(Date.now()),
    });
  },
});

// --- Delete whiteboard ---
export const deleteWhiteboard = mutation({
  args: { id: v.id("whiteboards") },
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Call the internal mutation, passing the user id
    await ctx.runMutation(internal.whiteboards.deleteWhiteboardInternal, {
      id,
      userId: identity.subject,
    });
  },
});

// Internal mutation: receives userId as an argument
export const deleteWhiteboardInternal = internalMutation({
  args: { id: v.id("whiteboards"), userId: v.string() },
  handler: async (ctx, { id, userId }) => {
    const whiteboard = await ctx.db.get(id);
    if (!whiteboard) throw new Error("Whiteboard not found");

    if (whiteboard.ownerId !== userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.delete(id);
    const previewImageStorageId = whiteboard.previewStorageId;
    if (!previewImageStorageId) return;
    await ctx.storage.delete(previewImageStorageId);
  },
});

// --- List all whiteboards for the current user ---
export const listWhiteboards = query({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, { projectId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    if (projectId) {
      const project = await ctx.db
        .query("projects")
        .withIndex("by_id", (q) => q.eq("_id", projectId))
        .unique();
      if (!project) return null;

      return await ctx.db
        .query("whiteboards")
        .withIndex("by_projectId_and_ownerId", (q) =>
          q.eq("projectId", projectId).eq("ownerId", userId),
        )
        .order("desc")
        .collect();
    }

    // If no project specified, return all user's root whiteboards
    return await ctx.db
      .query("whiteboards")
      .withIndex("by_projectId_and_ownerId", (q) =>
        q.eq("projectId", undefined).eq("ownerId", userId),
      )
      .order("desc")
      .collect();
  },
});

// --- Get a specific whiteboard by ID ---
export const getWhiteboard = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const normalizedId = ctx.db.normalizeId("whiteboards", id);
    if (!normalizedId) {
      return undefined; // Return undefined if the ID is invalid
    }

    const whiteboard = await ctx.db.get(normalizedId);
    if (!whiteboard) return undefined;

    if (whiteboard.isPublic) {
      return whiteboard;
    }

    if (whiteboard.ownerId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    return whiteboard;
  },
});

// --- Set the public status of a whiteboard ---
export const setPublicStatus = mutation({
  args: {
    id: v.id("whiteboards"),
    isPublic: v.boolean(),
  },
  handler: async (ctx, { id, isPublic }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const whiteboard = await ctx.db.get(id);
    if (!whiteboard) throw new Error("Whiteboard not found");

    // Only the owner can change the public status.
    if (whiteboard.ownerId !== identity.subject) {
      throw new Error("Unauthorized: Only the owner can change this setting.");
    }

    await ctx.db.patch(id, {
      isPublic,
      updatedAt: BigInt(Date.now()),
    });
  },
});

// --- Copy a public whiteboard ---
export const copyPublicWhiteboard = mutation({
  args: {
    sourceId: v.string(),
  },
  handler: async (ctx, { sourceId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const normalizedId = ctx.db.normalizeId("whiteboards", sourceId);
    if (!normalizedId) throw new Error("Could not normalize ID");

    const sourceWhiteboard = await ctx.db.get(normalizedId);
    if (!sourceWhiteboard) throw new Error("Source whiteboard not found");

    if (!sourceWhiteboard.isPublic) {
      throw new Error("Can only copy public whiteboards");
    }

    const { maxWhiteboardCount, currentWhiteboardCount } = await ctx.runQuery(
      api.whiteboards.getWhiteboardCountLimit,
    );

    if (currentWhiteboardCount + 1 > maxWhiteboardCount) {
      throw new Error(
        `You have reached the limit of ${maxWhiteboardCount} whiteboards for your plan. Please delete some whiteboards or upgrade your plan.`,
      );
    }

    const { maxNodeCount } = await ctx.runQuery(
      api.whiteboards.getNodeCountLimit,
    );

    if (sourceWhiteboard.nodes.length > maxNodeCount) {
      throw new Error(
        `Cannot copy whiteboard: it contains ${sourceWhiteboard.nodes.length} nodes, but your plan only allows ${maxNodeCount} nodes. Please upgrade your plan to copy this whiteboard.`,
      );
    }

    // --- Step 1: Prepare new node data and gather image mappings ---

    const newNodes = [];
    const imageNodeMappings = []; // To store { newId, storageId }
    const nodeIdMap = new Map<string, string>(); // Map old node IDs to new node IDs

    for (const node of sourceWhiteboard.nodes) {
      const newId = uuidv4(); // Generate a new, unique ID for the copied node
      nodeIdMap.set(node.id, newId); // Store the mapping

      if (node.type === "image") {
        // This is an image node, we need to find its storageId
        const originalImageRecord = await ctx.db
          .query("imageNodes")
          .withIndex("by_nodeId_and_whiteboardId", (q) =>
            q.eq("nodeId", node.id).eq("whiteboardId", normalizedId),
          )
          .first();

        if (originalImageRecord) {
          // If we found the record, save the mapping. We will use this
          // to create a new imageNodes record for our new whiteboard.
          imageNodeMappings.push({
            newId: newId,
            storageId: originalImageRecord.storageId,
            imageUrl: originalImageRecord.imageUrl, // Keep the URL consistent
          });
        } else {
          // This indicates a data integrity problem, the image might already be broken.
          // We'll skip copying the link to prevent errors.
          console.warn(`Could not find image record for nodeId: ${node.id}`);
          // We still push the node, but its imageUrl will be whatever was in the source.
          // It might appear broken, which is accurate.
        }
      }

      // Add the copied node with its new ID to our array.
      newNodes.push({ ...node, id: newId });
    }

    // --- Step 2: Remap edges to use new node IDs ---
    const newEdges = sourceWhiteboard.edges.map((edge) => ({
      ...edge,
      id: uuidv4(), // Generate new ID for the edge
      source: nodeIdMap.get(edge.source) ?? edge.source, // Map source to new ID
      target: nodeIdMap.get(edge.target) ?? edge.target, // Map target to new ID
    }));

    // --- Step 3: Insert the new whiteboard to get its ID ---

    const now = BigInt(Date.now());
    const newWhiteboardId = await ctx.db.insert("whiteboards", {
      title: `${sourceWhiteboard.title} (Copy)`,
      createdAt: now,
      updatedAt: now,
      ownerId: identity.subject,
      nodes: newNodes,
      edges: newEdges,
      isPublic: false,
    });

    // --- Step 4: Create the new imageNodes records ---

    for (const mapping of imageNodeMappings) {
      await ctx.db.insert("imageNodes", {
        nodeId: mapping.newId,
        storageId: mapping.storageId,
        imageUrl: mapping.imageUrl,
        whiteboardId: newWhiteboardId, // Link to the NEW whiteboard
        authorExternalId: identity.subject, // Link to the new author
      });
    }

    // Return the ID of the newly created whiteboard
    return newWhiteboardId;
  },
});

export const generatePreviewUploadUrl = mutation({
  args: {
    whiteboardId: v.string(),
  },
  handler: async (ctx, { whiteboardId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const normalizedWhiteboardId = ctx.db.normalizeId(
      "whiteboards",
      whiteboardId,
    );
    if (!normalizedWhiteboardId) {
      throw new Error("Could not normalize whiteboard ID");
    }
    const whiteboard = await ctx.db
      .query("whiteboards")
      .withIndex("by_id", (q) => q.eq("_id", normalizedWhiteboardId))
      .first();
    if (!whiteboard) {
      throw new Error("Whiteboard not found");
    }
    if (whiteboard.ownerId !== identity.subject) {
      throw new Error(
        "Unauthorized: Only the owner can generate a preview upload URL.",
      );
    }

    return await ctx.storage.generateUploadUrl();
  },
});

export const uploadPreviewImage = mutation({
  args: {
    whiteboardId: v.string(),
    previewImageStorageId: v.id("_storage"),
  },
  handler: async (ctx, { whiteboardId, previewImageStorageId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const normalizedWhiteboardId = ctx.db.normalizeId(
      "whiteboards",
      whiteboardId,
    );
    if (!normalizedWhiteboardId)
      throw new Error("Could not normalize whiteboard ID");
    const whiteboard = await ctx.db
      .query("whiteboards")
      .withIndex("by_id", (q) => q.eq("_id", normalizedWhiteboardId))
      .first();
    if (!whiteboard) {
      throw new Error("Whiteboard not found");
    }
    if (whiteboard.ownerId !== identity.subject) {
      throw new Error(
        "Unauthorized: Only the owner can upload a preview image.",
      );
    }

    const previewImageUrl = await ctx.storage.getUrl(previewImageStorageId);
    if (!previewImageUrl) {
      throw new Error("Failed to retrieve the preview image URL.");
    }

    const oldPreviewStorageId = whiteboard.previewStorageId;
    if (oldPreviewStorageId) {
      await ctx.scheduler.runAfter(0, internal.whiteboards.deletePreviewImage, {
        storageId: oldPreviewStorageId,
      });
    }

    // Update the whiteboard with the new preview image storage ID
    await ctx.db.patch(normalizedWhiteboardId, {
      previewStorageId: previewImageStorageId,
      updatedAt: BigInt(Date.now()),
      previewUrl: previewImageUrl,
    });

    return { success: true };
  },
});

export const deletePreviewImage = internalMutation({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, { storageId }) => {
    // User has to be authenticated before calling this internal mutation

    await ctx.storage.delete(storageId);
  },
});

// ! WARNING: Only call this when absolutely needed
export const normalizeWhiteboardId = query({
  args: {
    whiteboardId: v.string(),
  },
  handler: async (ctx, { whiteboardId }) => {
    const normalizedId = ctx.db.normalizeId("whiteboards", whiteboardId);
    return normalizedId;
  },
});
