"use client";

import { useRef, useState, useEffect } from "react";
import type { InventoryItem } from "@/lib/steam-api";
import { SteamIcon } from "@/components/ui/steam-icon";
import { CSFloatIcon } from "@/components/ui/csfloat-icon";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Send, SquareArrowOutUpRight, Plus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";

interface SelectedItemsProps {
  items: InventoryItem[];
  onRemoveItem: (id: string) => void;
  onClearAll: () => void;
}

export function SelectedItems({
  items,
  onRemoveItem,
  onClearAll,
}: SelectedItemsProps) {
  const [jsonResult, setJsonResult] = useState<string | null>(null);
  const [responseItems, setResponseItems] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingCraft, setIsLoadingCraft] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoadingMoreCrafts, setIsLoadingMoreCrafts] = useState(false);
  const [selectedWeaponTypes, setSelectedWeaponTypes] = useState<string[]>([
    "any",
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Define weapon types for selection
  const weaponTypes = [
    { id: "pistol", name: "Pistols" },
    { id: "smg", name: "SMGs" },
    { id: "rifle", name: "Rifles" },
    { id: "sniper", name: "Snipers" },
    { id: "shotgun", name: "Shotguns" },
    { id: "machinegun", name: "Machine Guns" },
    { id: "knife", name: "Knives" },
    { id: "gloves", name: "Gloves" },
  ];

  // Toggle weapon type selection
  const toggleWeaponType = (typeId: string) => {
    if (typeId === "any") {
      // If "any" is clicked, select only "any" and deselect others
      setSelectedWeaponTypes(["any"]);
    } else {
      setSelectedWeaponTypes((prev) => {
        // If another type is selected, remove "any" from the selection
        let newSelection = prev.filter((id) => id !== "any");

        // Toggle the selected type
        if (newSelection.includes(typeId)) {
          const newSelectionFiltered = newSelection.filter(
            (id) => id !== typeId
          );
          newSelection = newSelectionFiltered;
        } else {
          newSelection.push(typeId);
        }

        // If no types are selected, select "any" again
        if (newSelection.length === 0) {
          return ["any"];
        }

        return newSelection;
      });
    }
  };

  // Handle requesting more crafts
  const handleSubmitCrafts = async () => {
    if (items.length === 0) return;

    const item_data = [];
    for (const item of items) {
      item_data.push(item);
    }

    const requestData = {
      item: item_data[0],
    };

    const payload = {
      type: "crafts",
      data: requestData,
    };

    setIsLoadingCraft(true);
    try {
      // Call the API with the selected items
      const response = await fetch("/api/steam/loadout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      const data = await response.json();

      // Display the JSON data
      setJsonResult(JSON.stringify(data, null, 2));

      // Store the response items
      setResponseItems(Array.isArray(data) ? data : []);

      toast({
        title: "Craft suggestions submitted",
        description: `${data.length} crafts have been recommended.`,
      });
    } catch (error) {
      console.log("Error submitting crafts:", error);
      toast({
        title: "Request failed",
        description:
          error instanceof Error ? error.message : "Failed to recommend crafts",
        variant: "destructive",
      });

      // For demo purposes, show the items that were submitted
      setJsonResult(JSON.stringify(items, null, 2));
      setResponseItems(items);
    } finally {
      setIsLoadingCraft(false);
    }
  };

  // Handle requesting more items
  const handleRequestMoreCrafts = async () => {
    if (isLoadingMoreCrafts) return;

    setIsLoadingMoreCrafts(true);
    try {
      // Combine selected items and existing response items for the API call
      const item_data = [];
      for (const item of items) {
        item_data.push(item);
      }

      const requestData = {
        item: item_data[0],
        exclude: responseItems.flatMap((item: any) => (item.stickers as any[])?.map((s: any) => s.name).filter(Boolean) ?? []),
      };

      const payload = {
        type: "crafts",
        data: requestData,
      };

      const response = await fetch("/api/steam/loadout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      const data = await response.json();

      // Update the JSON result
      setJsonResult(JSON.stringify(data, null, 2));

      // Add new items to existing response items (avoiding duplicates)
      const newItems = Array.isArray(data) ? data : [];
      const existingIds = new Set(
        responseItems.map((item: any) => JSON.stringify(item.stickers))
      );
      const uniqueNewItems = newItems.filter((item) => {
        // Create a unique identifier for the current item's stickers field
        const stickerId = JSON.stringify(item.stickers);

        // Only include items whose stickerId is not already in the existingIds set
        return !existingIds.has(stickerId);
      });

      setResponseItems((prev: any) => [...prev, ...uniqueNewItems]);

      toast({
        title: "More crafts requested",
        description: `Suggested ${uniqueNewItems.length} new crafts`,
      });
    } catch (error) {
      console.log("Error requesting more items:", error);
      toast({
        title: "Request failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to request more crafts",
        variant: "destructive",
      });
    } finally {
      setIsLoadingMoreCrafts(false);
    }
  };

  // Handle submitting items to the API
  const handleSubmitItems = async () => {
    if (items.length === 0) return;

    const item_data = [];
    for (const item of items) {
      const item_schema = {
        name: item.name,
        wear: item.wear_name,
        price: item.steam_price,
        image: item.icon_url,
      };
      item_data.push(item_schema);
    }

    const requestData = {
      items: item_data,
      weapon_preferences: selectedWeaponTypes.includes("any")
        ? ["any"]
        : selectedWeaponTypes,
    };

    const payload = {
      type: "items",
      data: requestData,
    };

    setIsLoading(true);
    try {
      // Call the API with the selected items
      const response = await fetch("/api/steam/loadout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      const data = await response.json();

      // Display the JSON data
      setJsonResult(JSON.stringify(data, null, 2));

      // Store the response items
      setResponseItems(Array.isArray(data) ? data : []);

      toast({
        title: "Loadout suggestions submitted",
        description: `${data.length} items have been recommended.`,
      });
    } catch (error) {
      console.error("Error submitting items:", error);
      toast({
        title: "Request failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to recommend items for your loadout",
        variant: "destructive",
      });

      // For demo purposes, show the items that were submitted
      setJsonResult(JSON.stringify(items, null, 2));
      setResponseItems(items);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle requesting more items
  const handleRequestMoreItems = async () => {
    if (isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      // Combine selected items and existing response items for the API call
      const combinedItems = [...items, ...responseItems];

      const requestData = {
        items: combinedItems,
        weapon_preferences: selectedWeaponTypes.includes("any")
          ? ["any"]
          : selectedWeaponTypes,
      };

      const payload = {
        type: "items",
        data: requestData,
      };

      // Call the API with the combined items
      const response = await fetch("/api/steam/loadout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      const data = await response.json();

      // Update the JSON result
      setJsonResult(JSON.stringify(data, null, 2));

      // Add new items to existing response items (avoiding duplicates)
      const newItems = Array.isArray(data) ? data : [];
      const existingIds = new Set(responseItems.map((item: any) => item.id));
      const uniqueNewItems = newItems.filter(
        (item) => !existingIds.has(item.id)
      );

      setResponseItems((prev: any) => [...prev, ...uniqueNewItems]);

      toast({
        title: "More items requested",
        description: `Suggested ${uniqueNewItems.length} new items`,
      });
    } catch (error) {
      console.log("Error requesting more items:", error);
      toast({
        title: "Request failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to recommend more items for you loadout",
        variant: "destructive",
      });
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Enhanced clear all function that also clears response items
  const handleClearAll = () => {
    setResponseItems([]);
    setJsonResult(null);
    onClearAll();
    setSelectedWeaponTypes(["any"]);
  };

  // If no items are selected and no response items, render nothing
  if (items.length === 0 && responseItems.length === 0) {
    return null;
  }

  // Map rarity names to color classes
  const getRarityColorClass = (rarity: string): string => {
    switch (rarity) {
      case "Consumer Grade":
        return "bg-gray-400";
      case "Industrial Grade":
        return "bg-blue-400";
      case "Mil-Spec Grade":
        return "bg-blue-500";
      case "Restricted":
        return "bg-purple-500";
      case "Classified":
        return "bg-pink-500";
      case "Covert":
        return "bg-red-500";
      case "Contraband":
        return "bg-amber-500";
      case "Extraordinary":
        return "bg-yellow-400";
      case "Exotic":
        return "bg-pink-500";
      case "Remarkable":
        return "bg-purple-500";
      case "High Grade":
        return "bg-blue-500";
      case "Master":
        return "bg-red-500";
      case "Superior":
        return "bg-pink-500";
      case "Exceptional":
        return "bg-purple-500";
      case "Distinguished":
        return "bg-blue-500";
      default:
        return "bg-gray-600";
    }
  };

  // Abbreviate wear names
  const getWearAbrev = (wear_name: string): string => {
    switch (wear_name) {
      case "Factory New":
        return "FN";
      case "Minimal Wear":
        return "MW";
      case "Field-Tested":
        return "FT";
      case "Well-Worn":
        return "WW";
      case "Batle-Scarred":
        return "BS";
      default:
        return "";
    }
  };

  return (
    <div className="mb-6 bg-gray-800 rounded-lg border border-gray-700 p-4">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h2 className="text-lg font-semibold">
            Selected Items ({items.length})
          </h2>
          <p className="text-sm text-gray-400">
            Select weapons or agents to add them here
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearAll}
            disabled={isLoading || isLoadingMore || isLoadingCraft}
            className="border-gray-600 hover:bg-gray-700"
          >
            Clear All
          </Button>
          {items.length === 1 &&
          (items[0].type === "Rifles" ||
            items[0].type === "SMGs" ||
            items[0].type === "Pistols" ||
            items[0].type === "Heavy") ? (
            <Button
              onClick={handleSubmitCrafts}
              className="bg-blue-600 hover:bg-blue-700"
              disabled={
                isLoading ||
                isLoadingMore ||
                isLoadingCraft ||
                isLoadingMoreCrafts
              }
            >
              {isLoadingCraft ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Recommend New Crafts
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={handleSubmitItems}
              className="bg-blue-600 hover:bg-blue-700"
              disabled={
                isLoading ||
                isLoadingMore ||
                isLoadingCraft ||
                isLoadingMoreCrafts ||
                items.length === 0
              }
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Recommend New Items
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="w-full overflow-auto">
        <div className="flex w-max space-x-4 pb-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="relative group flex-shrink-0 w-[120px] bg-gray-900 rounded-lg border border-gray-700"
            >
              <button
                className="absolute top-1 right-1 bg-gray-800 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onRemoveItem(item.id)}
                disabled={
                  isLoading ||
                  isLoadingMore ||
                  isLoadingCraft ||
                  isLoadingMoreCrafts
                }
              >
                <X className="h-3 w-3 text-gray-400" />
              </button>
              {/* Link buttons for response items too */}
              <div className="absolute top-1 left-1 flex space-x-1 z-10">
                {item.inspect_link && (
                  <Button
                    className="bg-[#0a4894] hover:bg-[#2a475e] text-white h-[16px] w-[16px] flex items-center justify-center rounded-full p-0 shrink-0"
                    onClick={() =>
                      window.open(item.inspect_link || "", "_blank")
                    }
                  >
                    <SquareArrowOutUpRight
                      className="h-[5px] w-[5px] shrink-0"
                      style={{
                        width: "12px",
                        height: "12px",
                        minWidth: "10px",
                        minHeight: "10px",
                      }}
                    />
                  </Button>
                )}
                {item.steam && (
                  <Button
                    className="bg-[#0a4894] hover:bg-[#2a475e] text-white h-[16px] w-[16px] flex items-center justify-center rounded-full p-0 shrink-0"
                    onClick={() => window.open(item.steam || "", "_blank")}
                  >
                    <SteamIcon className="h-[4px] w-[4px] shrink-0" />
                  </Button>
                )}
                {item.csfloat && (
                  <Button
                    className="bg-[#0a4894] hover:bg-[#2a475e] text-white h-[16px] w-[16px] flex items-center justify-center rounded-full p-0 shrink-0"
                    onClick={() => window.open(item.csfloat || "", "_blank")}
                  >
                    <CSFloatIcon className="h-[10px] w-[10px] shrink-0 rounded-full" />
                  </Button>
                )}
              </div>
              <div className="aspect-square pt-2 pr-2 pl-2">
                <img
                  src={item.icon_url}
                  alt={item.name}
                  className="h-full w-full object-contain"
                />
                {item.stickers && (item.stickers as any[]).length > 0 && (
                  <div className="flex items-center justify-evenly bottom-0 left-0 right-0 text-center text-xs gap-2">
                    {(item.stickers as any[])?.map((sticker, index) => (
                      <img
                        key={index}
                        src={sticker.image}
                        alt={sticker.name}
                        style={{ width: "20px", height: "20px" }} // adjust size as needed
                      />
                    ))}
                  </div>
                )}
              </div>
              <div className="p-2">
                <div className="flex items-center space-x-1">
                  <span
                    className={`inline-block h-2 w-2 shrink-0 ${getRarityColorClass(
                      item.rarity_name
                    )} rounded-full`}
                  ></span>
                  <p className="text-xs font-medium truncate">
                    {item.category === "weapon"
                      ? item.name.split("|")[1]
                      : item.name.split("|")[0].split(" ")[0] +
                        " " +
                        item.name.split("|")[0].split(" ")[1]}
                  </p>
                </div>
                <div className="flex justify-between items-center mt-1">
                  {item.wear_name && (
                    <p className="text-xs text-gray-300">
                      {getWearAbrev(item.wear_name || "") || item.type || ""}
                    </p>
                  )}
                  {item.steam_price && (
                    <p className="text-xs text-green-500">
                      ${item.steam_price.toFixed(2)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Weapon Type Selection Buttons */}
      {items.length > 0 &&
        !(
          items.length === 1 &&
          (items[0].type === "Rifles" ||
            items[0].type === "SMGs" ||
            items[0].type === "Pistols" ||
            items[0].type === "Heavy")
        ) && (
        <div className="mt-4 border-t border-gray-700 pt-4">
          <h3 className="text-sm font-medium mb-2">
            Select weapon types for suggestions:
          </h3>
          <div className="flex flex-wrap gap-2 items-center">
            <Button
              size="sm"
              variant={
                selectedWeaponTypes.includes("any") ? "default" : "outline"
              }
              onClick={() => toggleWeaponType("any")}
              className={`mr-3 ${
                selectedWeaponTypes.includes("any")
                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                  : "border-gray-600 hover:bg-gray-700 text-gray-300"
              }`}
              disabled={
                isLoading ||
                isLoadingMore ||
                isLoadingCraft ||
                isLoadingMoreCrafts
              }
            >
              Any
            </Button>

            {weaponTypes.map((type) => (
              <Button
                key={type.id}
                size="sm"
                variant={
                  selectedWeaponTypes.includes(type.id) ? "default" : "outline"
                }
                onClick={() => toggleWeaponType(type.id)}
                className={
                  selectedWeaponTypes.includes(type.id)
                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                    : "border-gray-600 hover:bg-gray-700 text-gray-300"
                }
                disabled={
                  isLoading ||
                  isLoadingMore ||
                  isLoadingCraft ||
                  isLoadingMoreCrafts
                }
              >
                {type.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Response Items Section */}
      {responseItems.length > 0 && (
        <div
          className={`${
            items.length > 0 ? "mt-6 pt-6 border-t border-gray-700" : ""
          }`}
        >
          <div className="flex justify-between items-center mb-3">
            <div>
              <h2 className="text-lg font-semibold">
                Recommended Items ({responseItems.length})
              </h2>
              <p className="text-sm text-gray-400">
                Items recommended to complete your loadout
              </p>
            </div>
            {items.length === 1 &&
            (items[0].type === "Rifles" ||
              items[0].type === "SMGs" ||
              items[0].type === "Pistols" ||
              items[0].type === "Heavy") ? (
              <Button
                onClick={handleRequestMoreCrafts}
                className="bg-green-600 hover:bg-green-700"
                disabled={
                  isLoading ||
                  isLoadingMore ||
                  isLoadingCraft ||
                  isLoadingMoreCrafts
                }
              >
                {isLoadingMoreCrafts ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Recommend More Crafts
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={handleRequestMoreItems}
                className="bg-green-600 hover:bg-green-700"
                disabled={
                  isLoading ||
                  isLoadingMore ||
                  isLoadingCraft ||
                  isLoadingMoreCrafts
                }
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Recommend More Items
                  </>
                )}
              </Button>
            )}
          </div>

          <ScrollArea
            className="w-full whitespace-nowrap"
          >
            <div className="flex space-x-4 pb-2">
              {responseItems.map((item) => (
                <TooltipProvider key={item.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        key={item.id}
                        className="relative flex-shrink-0 w-[120px] bg-gray-900 rounded-lg border border-gray-700 overflow-hidden"
                      >
                        {/* Link buttons for response items too */}
                        <div className="absolute top-1 left-1 flex space-x-1 z-10">
                          {item.inspect_link && (
                            <Button
                              className="bg-[#0a4894] hover:bg-[#2a475e] text-white h-[16px] w-[16px] flex items-center justify-center rounded-full p-0 shrink-0"
                              onClick={() =>
                                window.open(item.inspect_link || "", "_blank")
                              }
                            >
                              <SquareArrowOutUpRight
                                className="h-[5px] w-[5px] shrink-0"
                                style={{
                                  width: "12px",
                                  height: "12px",
                                  minWidth: "10px",
                                  minHeight: "10px",
                                }}
                              />
                            </Button>
                          )}
                          {item.steam && (
                            <Button
                              className="bg-[#0a4894] hover:bg-[#2a475e] text-white h-[16px] w-[16px] flex items-center justify-center rounded-full p-0 shrink-0"
                              onClick={() =>
                                window.open(item.steam || "", "_blank")
                              }
                            >
                              <SteamIcon className="h-[4px] w-[4px] shrink-0" />
                            </Button>
                          )}
                          {item.csfloat && (
                            <Button
                              className="bg-[#0a4894] hover:bg-[#2a475e] text-white h-[16px] w-[16px] flex items-center justify-center rounded-full p-0 shrink-0"
                              onClick={() =>
                                window.open(item.csfloat || "", "_blank")
                              }
                            >
                              <CSFloatIcon className="h-[10px] w-[10px] shrink-0 rounded-full" />
                            </Button>
                          )}
                        </div>

                        {/* Item image */}
                        <div className="aspect-square p-2 relative">
                          <div className="relative w-full h-full">
                            <Image
                              src={
                                item.icon_url ||
                                "/placeholder.svg?height=200&width=200"
                              }
                              alt={item.name || "Item"}
                              fill
                              className="object-contain"
                            />
                          </div>
                          {item.stickers && (item.stickers as any[]).length > 0 && (
                            <div className="flex items-center justify-evenly bottom-0 left-0 right-0 text-center text-xs gap-2">
                              {(item.stickers as any[])?.map((sticker, index) => (
                                <img
                                  key={index}
                                  src={sticker.image}
                                  alt={sticker.name}
                                  style={{ width: "20px", height: "20px" }} // adjust size as needed
                                />
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="p-2">
                          <div className="flex items-center space-x-1">
                            <span
                              className={`inline-block h-2 w-2 shrink-0 ${getRarityColorClass(
                                item.rarity_name
                              )} rounded-full`}
                            ></span>
                            <p className="text-xs font-medium truncate">
                              {item.category === "weapon"
                                ? item.name.split("|")[1]
                                : item.name.split("|")[0].split(" ")[0] +
                                  " " +
                                  item.name.split("|")[0].split(" ")[1]}
                            </p>
                          </div>
                          <div className="flex justify-between items-center mt-1">
                            {item.wear_name && (
                              <p className="text-xs text-gray-300">
                                {getWearAbrev(item.wear_name || "") ||
                                  item.type ||
                                  ""}
                              </p>
                            )}
                            {item.steam_price && (
                              <p className="text-xs text-green-500">
                                ${item.steam_price.toFixed(2)}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="w-64 p-0">
                      <div className="bg-gray-900 rounded-md overflow-hidden border border-gray-700">
                        <div className="p-3 space-y-2">
                          <p className="font-medium text-lg text-white">
                            {item.name?.includes("|")
                              ? item.name.split("|")[2]
                                ? item.name.split("|")[1]
                                : item.name.split("|")[0] +
                                  "|" +
                                  item.name.split("|")[1]
                              : item.type?.includes("Capsule")
                              ? item.name?.split(/\d+/)[1]
                              : item.name}
                          </p>
                          {item.custom_name && (
                            <p className="text-sm text-yellow-400">
                              Name Tag: {item.custom_name}
                            </p>
                          )}
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                            <p className="text-gray-300">Type:</p>
                            <p className="text-white">{item.type || "Other"}</p>

                            <p className="text-gray-300">Rarity:</p>
                            <p className="text-white">{item.rarity_name}</p>

                            {item.wear_name && (
                              <>
                                <p className="text-gray-300">Exterior:</p>
                                <p className="text-white">{item.wear_name}</p>
                              </>
                            )}

                            {!item.stickers && (
                              <p className="col-span-2 text-gray-300 text-s mt-2 break-words whitespace-normal break-spaces-normal">
                                {" "}
                                {item.reason}{" "}
                              </p>
                            )}
                          </div>
                          <div className="text-sm pt-2">
                            {item.stickers && (item.stickers as any[]).length > 0 && (
                              <>
                                <p className="font-medium text-center text-lg text-white">
                                  Craft:
                                </p>
                                <p className="text-gray-300 break-words whitespace-normal break-spaces-normal">
                                  4x -{" "}
                                  {(item.stickers as any[])[0].name
                                    .substring(
                                      (item.stickers as any[])[0].name.indexOf("|") + 1
                                    )
                                    .trim()}
                                </p>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm pt-2">
                                  <p className="text-gray-300">
                                    Price per Sticker:
                                  </p>
                                  <p className="text-green-400">
                                    $
                                    {Number(
                                      (item.stickers as any[])[0].steam_price
                                    ).toFixed(2)}
                                  </p>
                                </div>
                                <p className="col-span-2 text-gray-300 text-sm mt-2 break-words whitespace-normal break-spaces-normal">
                                  {" "}
                                  {item.reason}{" "}
                                </p>
                              </>
                            )}
                          </div>
                        </div>

                        {(item.steam_price || item.float_price) && (
                          <div className="bg-gray-800 p-3 mt-2">
                            <div className="grid grid-cols-2 gap-2">
                              {item.steam_price && (
                                <div>
                                  <p className="text-xs text-gray-300">
                                    Steam Price
                                  </p>
                                  <p className="text-green-400 font-medium">
                                    ${Number(item.steam_price).toFixed(2)}
                                  </p>
                                </div>
                              )}

                              {item.float_price && (
                                <div>
                                  <p className="text-xs text-gray-300">
                                    Float Price
                                  </p>
                                  <p className="text-blue-400 font-medium">
                                    ${item.float_price.toFixed(2)}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
