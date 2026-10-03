"use client";

import { useState, useEffect, useRef } from "react";
import {
  refreshInventory,
  type InventoryItem,
  type Sticker,
} from "@/lib/steam-api";
import type { FilterState } from "./inventory-filters";
import { Button } from "@/components/ui/button";
import { SteamIcon } from "@/components/ui/steam-icon";
import { CSFloatIcon } from "@/components/ui/csfloat-icon";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import {
  ArrowUpDown,
  DollarSign,
  Hash,
  Cloud,
  SquareArrowOutUpRight,
  Check,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

export function InventoryGrid({
  items,
  filters,
  onTotalValueChange,
  visibleItems = Number.POSITIVE_INFINITY,
  onFilteredItemsChange,
  onSelectItem,
  selectedItemIds = [],
  error,
  currencies,
  selectedCurrency,
  setLoading,
  setError,
  setStorageUnits,
  setItems,
  setTotalFilteredItems,
  setFilteredValue,
  loginType,
  onReload,
}: {
  items: InventoryItem[];
  filters: FilterState;
  onTotalValueChange?: (value: number) => void;
  visibleItems?: number;
  onFilteredItemsChange?: (items: InventoryItem[]) => void;
  onSelectItem?: (item: InventoryItem) => void;
  selectedItemIds?: string[];
  error: string | null;
  currencies: {
    code: string;
    char: string;
    rate: number;
    icon: React.ReactNode;
  }[];
  selectedCurrency?: string;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setStorageUnits: (units: number) => void;
  setItems: (items: InventoryItem[]) => void;
  setTotalFilteredItems: (items: InventoryItem[]) => void;
  setFilteredValue: (value: number) => void;
  loginType?: string;
  onReload?: (items: InventoryItem[]) => void;
}) {
  const [filteredItems, setFilteredItems] = useState<InventoryItem[]>(items);
  const [sortBy, setSortBy] = useState<
    | "none"
    | "value-desc"
    | "value-asc"
    | "quantity-desc"
    | "quantity-asc"
    | "float-desc"
    | "float-asc"
  >("value-desc");
  const [showJwtInput, setShowJwtInput] = useState(false);
  const [jwtToken, setJwtToken] = useState("");
  const [isReloading, setIsReloading] = useState(false);
  const filteredItemsRef = useRef<{
    items: InventoryItem[];
    totalValue: number;
  }>({ items: [], totalValue: 0 });
  const { toast } = useToast();

  // Apply filters whenever items or filters change
  useEffect(() => {
    let result = [...items];

    // Apply search filter
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      result = result.filter((item) =>
        item.name.toLowerCase().includes(searchLower)
      );
    }

    // Apply category filters
    const activeCategories = Object.entries(filters.categories)
      .filter(([_, isActive]) => isActive)
      .map(([category]) => category);

    if (activeCategories.length > 0) {
      result = result.filter(
        (item) => item.category && activeCategories.includes(item.category)
      );
    }

    // Apply type filters
    const activeTypes = Object.entries(filters.types)
      .filter(([_, isActive]) => isActive)
      .map(([type]) => type);

    if (activeTypes.length > 0) {
      result = result.filter(
        (item) => item.type && activeTypes.includes(item.type)
      );
    }

    // Apply exterior/wear filters
    const activeExteriors = Object.entries(filters.exteriors)
      .filter(([_, isActive]) => isActive)
      .map(([exterior]) => exterior);

    if (activeExteriors.length > 0) {
      result = result.filter(
        (item) => item.wear_name && activeExteriors.includes(item.wear_name)
      );
    }

    let filteredStorageResult: InventoryItem[] = [];

    const activeStorageUnits = Object.entries(filters.storage)
      .filter(([_, isActive]) => isActive === true)
      .map(([filter]) => filter);

    activeStorageUnits.forEach((filter) => {
      let filteredItems: InventoryItem[] = [];
      if (filter === "Main Inventory") {
        filteredItems = result.filter((item) => item.location === "Inventory");
      } else if (filter === "Storage Units") {
        filteredItems = result.filter((item) => item.location !== "Inventory");
      }

      // Append the filtered items to filteredResult
      filteredStorageResult = [...filteredStorageResult, ...filteredItems];
    });

    result = filteredStorageResult;

    let filteredSpecialResult: InventoryItem[] = [];

    const activeSpecialFilters = Object.entries(filters.special)
      .filter(([_, isActive]) => isActive === true) // Ensure we're only using filters that are 'true'
      .map(([filter]) => filter);

    // Loop through all active special filters and filter the result accordingly
    activeSpecialFilters.forEach((filter) => {
      let filteredItems: InventoryItem[] = [];
      if (filter === "StatTrak™") {
        filteredItems = result.filter((item) => item.is_stattrak === true);
      } else if (filter === "Souvenir") {
        filteredItems = result.filter((item) => item.is_souvenir === true);
      } else if (filter === "Name Tag") {
        filteredItems = result.filter(
          (item) => item.custom_name !== null && item.custom_name !== undefined
        );
      } else if (filter == "Stickers Applied") {
        filteredItems = result.filter(
          (item) => item.paint_index && item.stickers
        );
      } else if (filter == "Tradable") {
        filteredItems = result.filter((item) => item.is_tradable === true);
      } else if (filter == "Trade Protected") {
        filteredItems = result.filter((item) => item.is_tradable === false);
      }

      // Append the filtered items to filteredResult
      filteredSpecialResult = [...filteredSpecialResult, ...filteredItems];
    });

    filteredSpecialResult = filteredSpecialResult.filter(
      (value, index, self) =>
        index ===
        self.findIndex(
          (t) =>
            t.id === value.id // Replace `id` with the unique identifier for your items
        )
    );

    if (
      filters.special["Souvenir"] ||
      filters.special["StatTrak™"] ||
      filters.special["Name Tag"] ||
      filters.special["Stickers Applied"] ||
      filters.special["Tradable"] ||
      filters.special["Trade Protected"]
    ) {
      result = filteredSpecialResult;
    }

    // Apply sorting
    if (sortBy !== "none") {
      result = sortItems(result, sortBy);
    }

    // Calculate total value of filtered items
    const totalValue = result.reduce(
      (sum, item) => sum + (item.steam_price || 0) * (item.quantity || 1),
      0
    );

    // Update state and call callbacks

    setFilteredItems(result);

    // Use a separate effect for callbacks to prevent infinite loops
    const filteredItemsData = { items: result, totalValue };

    // Store the filtered data in a ref to access in another effect
    filteredItemsRef.current = filteredItemsData;
  }, [items, filters, sortBy]);

  // Call callbacks when filtered items or their total value changes
  useEffect(() => {
    const { items, totalValue } = filteredItemsRef.current;

    // Call callbacks with the latest data
    if (onTotalValueChange && selectedItemIds.length === 0) {
      onTotalValueChange(totalValue);
    }

    if (onFilteredItemsChange) {
      onFilteredItemsChange(items);
    }
  }, [onTotalValueChange, onFilteredItemsChange]);

  // Function to sort items
  const sortItems = (items: InventoryItem[], sortBy: string) => {
    const sorted = [...items];

    let filteredItems;
    switch (sortBy) {
      case "value-desc":
        return sorted.sort((a, b) => {
          const valueA = (a.steam_price || 0) * (a.quantity || 0);
          const valueB = (b.steam_price || 0) * (b.quantity || 0);
          return valueB - valueA;
        });
      case "value-asc":
        return sorted.sort((a, b) => {
          const valueA = (a.steam_price || 0) * (a.quantity || 0);
          const valueB = (b.steam_price || 0) * (b.quantity || 0);
          return valueA - valueB;
        });
      case "quantity-desc":
        return sorted.sort((a, b) => (b.quantity || 1) - (a.quantity || 1));
      case "quantity-asc":
        return sorted.sort((a, b) => (a.quantity || 1) - (b.quantity || 1));
      case "float-desc":
        filteredItems = sorted.filter((item) => item.paint_wear !== undefined);
        return filteredItems.sort(
          (a, b) => (b.paint_wear || 1) - (a.paint_wear || 1)
        );
      case "float-asc":
        filteredItems = sorted.filter((item) => item.paint_wear !== undefined);
        return filteredItems.sort(
          (a, b) => (a.paint_wear || 1) - (b.paint_wear || 1)
        );
      default:
        return sorted;
    }
  };

  // Handle sort changes
  const handleSortChange = (
    newSortBy:
      | "value-desc"
      | "value-asc"
      | "quantity-desc"
      | "quantity-asc"
      | "float-desc"
      | "float-asc"
  ) => {
    setSortBy(newSortBy);
  };

  // Handle item selection
  const handleSelectItem = (item: InventoryItem) => {
    if (onSelectItem && (item.category === "weapon" || item.type === "Agent")) {
      onSelectItem(item);
    }
  };

  // Check if an item is selectable (weapons or agents)
  const isItemSelectable = (item: InventoryItem) => {
    return item.category === "weapon" || item.type === "Agent";
  };

  // Get rarity color background CSS for items
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
      case "Base Grade":
        return "bg-gray-600";
      default:
        return "bg-gray-600";
    }
  };

  // Get rarity color text CSS for items
  const getRarityColorClassTxt = (rarity: string): string => {
    switch (rarity) {
      case "Consumer Grade":
        return "text-gray-400";
      case "Industrial Grade":
        return "text-blue-400";
      case "Mil-Spec Grade":
        return "text-blue-400";
      case "Restricted":
        return "text-purple-400";
      case "Classified":
        return "text-pink-400";
      case "Covert":
        return "text-red-400";
      case "Contraband":
        return "text-amber-400";
      case "Extraordinary":
        return "text-yellow-300";
      case "Exotic":
        return "text-pink-400";
      case "Remarkable":
        return "text-purple-400";
      case "High Grade":
        return "text-blue-400";
      case "Master":
        return "text-red-400";
      case "Superior":
        return "text-pink-400";
      case "Exceptional":
        return "text-purple-400";
      case "Distinguished":
        return "text-blue-400";
      default:
        return "text-gray-600";
    }
  };

  // Get wear abbreviation
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
      case "Not Painted":
        return "NP";
      default:
        return "";
    }
  };

  // Get visible items based on the limit
  const displayedItems = filteredItems.slice(0, visibleItems);

  // First load gets a slow staggered entrance; filter/sort changes re-key the grid and replay a
  // quicker one. Price updates (e.g. currency changes) keep the same key so they don't animate.
  const staggerEntranceRef = useRef(true);
  const gridKey = `${JSON.stringify(filters)}|${sortBy}`;
  const cardAnimationStyle = (index: number) =>
    staggerEntranceRef.current
      ? { animationDelay: `${Math.min(index, 30) * 35}ms`, animationDuration: "500ms" }
      : { animationDelay: `${Math.min(index, 12) * 20}ms`, animationDuration: "300ms" };
  useEffect(() => {
    if (displayedItems.length > 0) staggerEntranceRef.current = false;
  }, [displayedItems.length]);

  // Handle inventory reload with JWT token
  const handleReload = async () => {
    if (!showJwtInput) {
      // First click - show input field
      setShowJwtInput(true);
      return;
    }

    if (!jwtToken.trim()) {
      toast({
        title: "Error",
        description: "Please enter a JWT token",
        variant: "destructive",
      });
      return;
    }

    console.log("Reloading inventory with JWT token...");

    setIsReloading(true);
    try {
      let parsedJWT;
      try {
        parsedJWT = JSON.parse(jwtToken);
      } catch (error) {
        toast({
          title: "Invalid Token",
          variant: "destructive",
        });
        throw new Error("Invalid JWT token");
      }

      const steamId =
        JSON.parse(
          JSON.parse(localStorage.getItem("login_type") || "{}")?.authData
        )?.steamid ?? null;
      if (steamId != parsedJWT.steamid) {
        console.log("Mistmatched SteamID's - Please Login Again");
        toast({
          title: "Inventory Refresh Failed",
          description:
            "Mistmatched SteamID's - Please Login Again to view this inventory",
          variant: "destructive",
        });
        throw new Error("Mistmatched SteamID's");
      }

      if (
        !parsedJWT.logged_in ||
        !parsedJWT.steamid ||
        !parsedJWT.accountid ||
        !parsedJWT.account_name ||
        !parsedJWT.token
      ) {
        toast({
          title: "Invalid JWT Token",
          description: "Please enter a valid JWT token",
          variant: "destructive",
        });
        throw new Error("Invalid JWT token");
      }

      setLoading(true);
      console.log("Fetching inventory with JWT token...");
      const data = await refreshInventory(parsedJWT.steamid, jwtToken);
      if (!data) {
        toast({
          title: "Invalid api response",
          description: "Please try refreshing again",
          variant: "destructive",
        });
        throw new Error(`API error: No inventory data found`);
      }

      const items = data.item_data;

      // console.log("Inventory.tsx: Fetched inventory data:", data);

      if (!data.success) {
        setTimeout(() => {
          toast({
            title: "Error fetching invetory",
            description: data.error,
            variant: "destructive",
          });
        }, 2000);
        throw new Error(`API error: Error inventory data`);
      }

      setError(data.error);
      setStorageUnits(data.storage_units);
      setItems(items);
      setTotalFilteredItems(items);

      const initialValue = items.reduce(
        (sum, item) => sum + (item.steam_price || 0) * (item.quantity || 1),
        0
      );
      setFilteredValue(initialValue);
    } catch (error: unknown | any) {
      console.log("Error reloading inventory:", error);
      setShowJwtInput(false);
      setLoading(false);
      setJwtToken("");
    } finally {
      setIsReloading(false);
      setLoading(false);
    }
  };

  // Handle canceling the JWT input
  const handleCancel = () => {
    setShowJwtInput(false);
    setJwtToken("");
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap justify-between items-center gap-2">
        <h2 className="text-lg font-semibold text-gray-100">Results <span className="text-gray-500 font-normal">({filteredItems.length})</span></h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 p-1 rounded">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReload}
              disabled={isReloading}
              className="border-gray-600 hover:bg-gray-700 bg-transparent"
              title="Reload inventory with JWT token"
            >
              {isReloading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>

            {showJwtInput && !isReloading && (
              <>
                <Input
                  type="text"
                  placeholder="Enter JWT token"
                  value={jwtToken}
                  onChange={(e) => setJwtToken(e.target.value)}
                  className="w-40 sm:w-60 bg-gray-900 border-gray-600 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleReload();
                    } else if (e.key === "Escape") {
                      handleCancel();
                    }
                  }}
                  autoFocus
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    window.open(
                      "https://steamcommunity.com/chat/clientjstoken",
                      "_blank"
                    )
                  }
                  className="border-gray-600 hover:bg-gray-700 bg-transparent"
                  title="Fetch new JWT token from Steam"
                >
                  <SquareArrowOutUpRight className="h-8 w-8" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  className="text-gray-400 hover:text-white"
                >
                  Cancel
                </Button>
              </>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="text-black bg-gray-200 hover:bg-gray-400"
              >
                <ArrowUpDown className="mr-2 h-4 w-4" />
                Sort By
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleSortChange("value-desc")}>
                <DollarSign className="mr-2 h-4 w-4 text-green-500" />
                Price: High to Low
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSortChange("value-asc")}>
                <DollarSign className="mr-2 h-4 w-4 text-green-500" />
                Price: Low to High
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleSortChange("quantity-desc")}
              >
                <Hash className="mr-2 h-4 w-4 text-blue-400" />
                Quantity: High to Low
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleSortChange("quantity-asc")}
              >
                <Hash className="mr-2 h-4 w-4 text-blue-400" />
                Quantity: Low to High
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSortChange("float-desc")}>
                <Cloud className="mr-2 h-4 w-4 text-red-400" />
                Float: High to Low
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSortChange("float-asc")}>
                <Cloud className="mr-2 h-4 w-4 text-red-400" />
                Float: Low to High
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          {error !== null && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <p className="text-lg">Error Retrieving Inventory Data</p>
              <p className="text-sm mt-2">
                Try Logging in again / Close any active CS2 Game Sessions
              </p>
            </div>
          )}
          {error === null && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <p className="text-lg">No items match your filters</p>
              <p className="text-sm mt-2">Try adjusting your filter criteria</p>
            </div>
          )}
        </div>
      ) : (
        <div
          key={gridKey}
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
        >
          {displayedItems.map((item, index) => (
            <TooltipProvider key={item.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Card
                    key={item.id}
                    style={cardAnimationStyle(index)}
                    className={`overflow-hidden animate-in fade-in slide-in-from-bottom-3 ease-out fill-mode-backwards ${getRarityColorClass(
                      item.rarity_name
                    )} transition-all hover:scale-105 hover:shadow-lg border-2 ${
                      selectedItemIds?.includes(item.id)
                        ? "border-blue-500 ring-1 ring-blue-500"
                        : `${
                            !item.is_tradable
                              ? "border-red-400"
                              : "border-green-400"
                          }` // `${getRarityColorClassBg(item.rarity_name)}`
                    } ${isItemSelectable(item) ? "cursor-pointer" : ""}`}
                    onClick={(e) =>
                      isItemSelectable(item) && handleSelectItem(item)
                    }
                  >
                    <div className="relative aspect-square w-full bg-gray-900 flex items-center justify-center">
                      {isItemSelectable(item) && (
                        <div
                          className={`absolute top-2 left-2 z-10 rounded-full p-1 ${
                            selectedItemIds?.includes(item.id)
                              ? "bg-blue-500"
                              : "bg-gray-800 opacity-0 group-hover:opacity-100"
                          } transition-all`}
                        >
                          <Check className="h-3 w-3 text-white" />
                        </div>
                      )}
                      <Image
                        src={
                          item.icon_url ??
                          "/placeholder.svg?height=200&width=200"
                        }
                        alt={item.name}
                        fill
                        className="object-contain p-2"
                        priority={true}
                      />
                      {item.is_stattrak && (
                        <Badge className="absolute left-10 top-2 bg-orange-600">
                          StatTrak™
                        </Badge>
                      )}
                      {item.is_souvenir && (
                        <Badge className="absolute left-10 top-2 bg-yellow-600">
                          Souvenir
                        </Badge>
                      )}
                      {item.quantity > 0 && (
                        <Badge className="absolute right-2 top-2 bg-blue-600">
                          x{item.quantity}
                        </Badge>
                      )}
                      {/* {item.location !== "Inventory" && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/80 p-1 text-center text-xs">
                          Storage Unit
                        </div>
                      )} */}
                      {(item.stickers as Sticker[])?.length > 0 && (
                        <div className="absolute flex justify-evenly bottom-0 left-0 right-0 p-1 text-center text-xs gap-2">
                          {(item.stickers as Sticker[])?.map(
                            (sticker, index) => (
                              <Tooltip key={index}>
                                <TooltipTrigger asChild>
                                  <img
                                    key={index}
                                    src={sticker.image}
                                    alt={sticker.name}
                                    style={{ width: "24px", height: "24px" }} // adjust size as needed
                                  />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="w-16 p-0">
                                  <div className="bg-gray-900 rounded-md overflow-hidden border border-gray-700">
                                    <div className="p-3 space-y-2">
                                      {/* <p className="font-medium text-xxs text-white">
                                      {sticker.name.split('|')[1]}
                                    </p> */}
                                      <p className="text-white text-xxs">
                                        {sticker.name.split("|")[1]}
                                      </p>
                                      <p className="text-green-400 text-xxs">
                                        {
                                          currencies.find(
                                            (c) => c.code === selectedCurrency
                                          )?.char
                                        }
                                        {Number(sticker.steam_price).toFixed(2)}
                                      </p>
                                    </div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            )
                          )}
                        </div>
                      )}
                    </div>
                    <CardContent className="p-2 bg-gray-900">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`inline-block h-2 w-2 shrink-0 ${getRarityColorClass(
                            item.rarity_name
                          )} rounded-full`}
                        ></span>

                        {item.name?.includes("|") && (
                          <p className="text-xxs text-gray-300 truncate">
                            {item.name?.split("|")[0]
                              ? item.type === "Gloves" || item.type === "Knives"
                                ? item.name?.split("|")[0].split(" ")[0] +
                                  " " +
                                  item.name?.split("|")[0].split(" ")[2]
                                : item.category === "agent"
                                ? item.name?.split("|")[0].split(" ")[0] +
                                  " " +
                                  item.name?.split("|")[0].split(" ")[1]
                                : item.category === "sticker" &&
                                  item.name?.split("|")[2]
                                ? item.name?.split("|")[2]
                                : item.type === "Other"
                                ? item.type
                                : item.name?.split("|")[0]
                              : item.name?.split("|")[0]}
                          </p>
                        )}

                        {!item.name?.includes("|") && (
                          <p className="text-xxs text-gray-300 truncate">
                            {item.type?.includes("Capsule")
                              ? item.name?.match(/^.*\d+/)?.[0]
                              : item.type === "Case"
                              ? item.name?.includes("Operation")
                                ? item.name?.split(" ")[1] + " Collection"
                                : item.name?.includes("eSports")
                                ? item.name?.split(" ")[0] +
                                  " " +
                                  item.name?.split(" ")[1] +
                                  "Collection"
                                : item.name?.split(" ")[0] + " Collection"
                              : item.category === "sticker"
                              ? item.name?.split("|")[2]
                              : item.type}
                          </p>
                        )}

                        {/* Small link icon with a link */}
                        {item.inspect_link && (
                          <Button
                            className="bg-[#0a4894] hover:bg-[#2a475e] text-white h-[16px] w-[16px] flex items-center justify-center rounded-full p-0 shrink-0" // Custom small size for button and no padding
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
                            className="bg-[#0a4894] hover:bg-[#2a475e] text-white h-[16px] w-[16px] flex items-center justify-center rounded-full p-0 shrink-0" // Custom small size for button and no padding
                            onClick={() =>
                              window.open(item.steam || "", "_blank")
                            }
                          >
                            <SteamIcon className="h-[4px] w-[4px] shrink-0" />
                          </Button>
                        )}
                        {item.csfloat && (
                          <Button
                            className="bg-[#0a4894] hover:bg-[#2a475e] text-white h-[16px] w-[16px] flex items-center justify-center rounded-full p-0 shrink-0" // Custom small size for button and no padding
                            onClick={() =>
                              window.open(item.csfloat || "", "_blank")
                            }
                          >
                            <CSFloatIcon className="h-[10px] w-[10px] shrink-0 rounded-full" />
                          </Button>
                        )}
                      </div>
                      <div className="flex justify-between items-center mt-1">
                        {item.wear_name && (
                          <p className="text-xs text-gray-300 truncate">
                            {getWearAbrev(item.wear_name || "") ||
                              item.type ||
                              ""}{" "}
                            {item.paint_wear === -1
                              ? ""
                              : `- ${(item.paint_wear ?? 0).toFixed(5)}`}
                          </p>
                        )}
                        {!item.wear_name && !item.sticker_id && (
                          <p className="text-xs text-gray-300 truncate">
                            {getWearAbrev(item.wear_name || "") ||
                              item.type ||
                              ""}
                          </p>
                        )}
                        {item.sticker_id && (
                          <p className="text-xs text-gray-300 truncate">
                            {item.type + " " + item.name?.split("|")[0] || ""}
                          </p>
                        )}
                        {item.steam_price && (
                          <p className="text-xs font-medium text-green-400">
                            {
                              currencies.find(
                                (c) => c.code === selectedCurrency
                              )?.char
                            }
                            {Number(item.steam_price * item.quantity).toFixed(
                              2
                            )}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
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
                        <p className="text-gray-300">Rarity:</p>
                        <p
                          className={`${getRarityColorClassTxt(
                            item.rarity_name
                          )}`}
                        >
                          {item.rarity_name}
                        </p>

                        {item.wear_name && (
                          <>
                            <p className="text-gray-300">Exterior:</p>
                            <p className="text-white">{item.wear_name}</p>
                          </>
                        )}

                        {item.paint_wear !== undefined && (
                          <>
                            <p className="text-gray-300">Float:</p>
                            {item.paint_wear === -1 ? (
                              <p className="font-mono text-white">Unknown</p>
                            ) : item.paint_wear === null ? (
                              <p className="font-mono text-white">N/A</p>
                            ) : (
                              <p className="font-mono text-white">
                                {item.paint_wear.toFixed(10)}
                              </p>
                            )}
                          </>
                        )}

                        {item.sticker_id && item.name.split("|")[2] && (
                          <>
                            <p className="text-gray-300">Major:</p>
                            <p className="font-mono text-white">
                              {item.name?.split("|")[2]}
                            </p>
                          </>
                        )}

                        <p className="text-gray-300">Location:</p>
                        <p className="text-white">{item.location}</p>
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
                                {
                                  currencies.find(
                                    (c) => c.code === selectedCurrency
                                  )?.char
                                }
                                {Number(item.steam_price).toFixed(2)}
                              </p>
                            </div>
                          )}

                          {item.float_price && (
                            <div>
                              <p className="text-xs text-gray-300">
                                Float Price
                              </p>
                              <p className="text-blue-400 font-medium">
                                {
                                  currencies.find(
                                    (c) => c.code === selectedCurrency
                                  )?.char
                                }
                                {item.float_price.toFixed(2)}
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
      )}
    </div>
  );
}
