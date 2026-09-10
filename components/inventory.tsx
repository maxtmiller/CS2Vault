"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { InventoryGrid } from "@/components/inventory-grid";
import {
  InventoryFilters,
  type FilterState,
} from "@/components/inventory-filters";
import { InventoryStats } from "@/components/inventory-stats";
import { LoadingInventory } from "@/components/loading-inventory";
import { UserProfile } from "@/components/user-profile";
import { fetchInventory, type InventoryItem } from "@/lib/steam-api";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ChevronDown, Github, SlidersHorizontal } from "lucide-react";
import { SteamIcon } from "@/components/ui/steam-icon";
import { SelectedItems } from "@/components/selected-items";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, Euro, PoundSterling } from "lucide-react";

const currencies = [
  {
    code: "USD",
    char: "$",
    rate: 1,
    icon: <DollarSign className="mr-2 h-4 w-4 text-green-500" />,
  },
  {
    code: "EUR",
    char: "€",
    rate: 0.86,
    icon: <Euro className="mr-2 h-4 w-4 text-blue-500" />,
  },
  {
    code: "GBP",
    char: "£",
    rate: 0.75,
    icon: <PoundSterling className="mr-2 h-4 w-4 text-purple-500" />,
  },
];

export function Inventory({ steamId }: { steamId: string | null }) {
  const [loginType, setLoginType] = useState<string>("");
  const [selectedCurrency, setSelectedCurrency] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("selected_currency") || "USD";
    }
    return "USD";
  });
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [storageUnits, setStorageUnits] = useState<number>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filteredValue, setFilteredValue] = useState(0);
  const [visibleItems, setVisibleItems] = useState(24);
  const [isScrolled, setIsScrolled] = useState(false);
  const [filteredItems, setFilteredItems] = useState<InventoryItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<InventoryItem[]>([]);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const [filters, setFilters] = useState<FilterState>({
    searchTerm: "",
    categories: {
      weapon: false,
      container: false,
      sticker: false,
      agent: false,
      charm: false,
    },
    exteriors: {
      "Factory New": false,
      "Minimal Wear": false,
      "Field-Tested": false,
      "Well-Worn": false,
      "Battle-Scarred": false,
    },
    storage: {
      "Main Inventory": true,
      "Storage Units": true,
    },
    special: {
      "StatTrak™": false,
      Souvenir: false,
      "Stickers Applied": false,
      "Name Tag": false,
      Tradable: false,
      "Trade Protected": false,
    },
    types: {
      Pistols: false,
      SMGs: false,
      Rifles: false,
      Heavy: false,
      Knives: false,
      Gloves: false,
      Case: false,
      Sticker: false,
      Key: false,
      Agent: false,
      "Music Kit": false,
      Patch: false,
      Graffiti: false,
    },
    storageUnits: {},
  });
  const currentPriceBaseRef = useRef("USD");
  const { toast } = useToast();

  const activeFilterCount = useMemo(() => {
    return [
      ...Object.values(filters.categories),
      ...Object.values(filters.types),
      ...Object.values(filters.exteriors),
      ...Object.values(filters.special),
      filters.searchTerm ? true : false,
    ].filter(Boolean).length;
  }, [filters]);

  const handleLogout = () => {
    localStorage.removeItem("login_type");
    localStorage.removeItem("inventory_data");
    fetch(`/api/auth/logout?steamid=${steamId}`, { method: "POST" })
      .then(() => window.location.replace("/"))
      .catch((error) => console.error("Logout error:", error));
  };

  function updateSteamPrices(multiplier: number) {
    setItems((prevItems) =>
      prevItems.map((item) => ({
        ...item,
        steam_price:
          item.steam_price !== null
            ? Number((item.steam_price * multiplier).toFixed(2))
            : null,
      }))
    );
  }

  function getRateByCurrency(code: string) {
    const currency = currencies.find((c) => c.code === code);
    return currency ? currency.rate : 1;
  }

  useEffect(() => {
    const oldRate = getRateByCurrency(currentPriceBaseRef.current);
    const newRate = getRateByCurrency(selectedCurrency);
    updateSteamPrices(newRate / oldRate);
    currentPriceBaseRef.current = selectedCurrency;
    localStorage.setItem("selected_currency", selectedCurrency);
  }, [selectedCurrency]);

  useEffect(() => {
    const storedCurrency = localStorage.getItem("selected_currency");
    if (storedCurrency) setSelectedCurrency(storedCurrency);
  }, []);

  useEffect(() => {
    const value = selectedItems.reduce(
      (sum, item) => sum + (item.steam_price || 0) * (item.quantity || 1),
      0
    );
    setFilteredValue(value);
  }, [selectedItems]);

  useEffect(() => {
    let logoutTimer: ReturnType<typeof setTimeout> | null = null;

    async function loadInventory() {
      if (!steamId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await fetchInventory(steamId);
        const items = data.item_data;
        setError(data.error);
        setStorageUnits(data.storage_units);
        setItems(items);
        setFilteredItems(items);
        setLoginType(data.type);
        updateSteamPrices(getRateByCurrency(selectedCurrency));
        setFilteredValue(
          items.reduce(
            (sum, item) => sum + (item.steam_price || 0) * (item.quantity || 1),
            0
          )
        );
        if (!data.success) {
          toast({
            title: "Error fetching inventory",
            description: data.error,
            variant: "destructive",
          });
          // Only auto-logout on auth errors, not transient errors like concurrent requests
          const isAuthError = data.error && (
            data.error.includes("Login") ||
            data.error.includes("expired") ||
            data.error.includes("Session") ||
            data.error.includes("login")
          );
          if (isAuthError) {
            logoutTimer = setTimeout(() => handleLogout(), 5000);
          }
        }
      } catch (error) {
        console.log("Error loading inventory:", error);
      } finally {
        setLoading(false);
      }
    }
    loadInventory();
    return () => { if (logoutTimer) clearTimeout(logoutTimer); };
  }, [steamId]);

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      const documentHeight = document.documentElement.scrollHeight;
      const windowHeight = window.innerHeight;
      const scrollPercentage = Math.min(
        scrollPosition / (documentHeight - windowHeight),
        1
      );

      setIsScrolled(scrollPosition > 110);

      if (filterRef.current) {
        const maxFilterScroll =
          filterRef.current.scrollHeight - filterRef.current.clientHeight;
        filterRef.current.scrollTop = scrollPercentage * maxFilterScroll;
      }
    };
    window.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleTotalValueChange = (value: number) => setFilteredValue(value);
  const handleShowMore = () => setVisibleItems((prev) => prev + 24);
  const handleFilteredItemsChange = (items: InventoryItem[]) =>
    setFilteredItems(items);

  const handleSelectItem = (item: InventoryItem) => {
    setSelectedItems((prev) => {
      const isSelected = prev.some((s) => s.id === item.id);
      return isSelected ? prev.filter((s) => s.id !== item.id) : [...prev, item];
    });
  };

  const handleRemoveSelectedItem = (id: string) =>
    setSelectedItems((prev) => prev.filter((item) => item.id !== id));

  const handleClearSelectedItems = () => setSelectedItems([]);

  const currencyChar =
    currencies.find((c) => c.code === selectedCurrency)?.char ?? "$";

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white">
      {/* Header */}
      <header
        className={`${
          isScrolled ? "fixed" : "sticky"
        } w-full top-0 z-50 border-b border-white/5 bg-gray-950/90 backdrop-blur-md shadow-lg transition-all duration-300`}
      >
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Logo */}
            <div className="flex items-center gap-3 shrink-0">
              <img src="/logo.png" width="30" height="30" alt="CS2 Vault" />
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                CS2 Vault
              </h1>
            </div>

            {/* Scrolled stats — desktop only */}
            <div
              className={`hidden md:flex items-center gap-5 text-sm transition-all duration-300 ${
                isScrolled
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 -translate-y-3 pointer-events-none"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500">Items</span>
                <span className="font-semibold">{items.length}</span>
              </div>
              <div className="w-px h-3.5 bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500">Storage</span>
                <span className="font-semibold">{storageUnits ?? 0}</span>
              </div>
              <div className="w-px h-3.5 bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500">Value</span>
                <span className="font-semibold text-green-400">
                  {currencyChar}{filteredValue.toFixed(2)}
                </span>
              </div>
            </div>

            {/* User profile */}
            <div className="shrink-0">
              {steamId && (
                <UserProfile
                  steamId={steamId}
                  currencies={currencies}
                  selectedCurrency={selectedCurrency}
                  setSelectedCurrency={setSelectedCurrency}
                />
              )}
            </div>
          </div>
        </div>
      </header>

      <main ref={mainRef} className="container mx-auto px-4 py-5 pb-16">
        {/* Stats — hidden when scrolled */}
        <div
          className={`mb-5 transition-all duration-300 ${
            isScrolled
              ? "opacity-0 max-h-0 overflow-hidden mb-0"
              : "opacity-100 max-h-40"
          }`}
        >
          <InventoryStats
            items={items}
            storageUnits={storageUnits}
            filteredValue={filteredValue}
            currencies={currencies}
            selectedCurrency={selectedCurrency}
            hideId={true}
          />
        </div>

        {/* Selected items */}
        <SelectedItems
          items={selectedItems}
          onRemoveItem={handleRemoveSelectedItem}
          onClearAll={handleClearSelectedItems}
        />

        <div className="grid gap-5 md:grid-cols-[272px_1fr]">
          {/* Desktop sidebar filters */}
          <div
            ref={filterRef}
            className="hidden md:block sticky top-[72px] self-start max-h-[calc(100vh-88px)] overflow-y-auto"
          >
            <InventoryFilters
              onFilterChange={setFilters}
              storageUnitNames={[]}
            />
          </div>

          {/* Items column */}
          <div ref={itemsRef}>
            {/* Mobile filter trigger */}
            <div className="md:hidden mb-4">
              <Sheet open={mobileFilterOpen} onOpenChange={setMobileFilterOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-gray-700 bg-gray-900/80 hover:bg-gray-800 text-white relative"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    Filters
                    {activeFilterCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-blue-500 text-[10px] font-bold flex items-center justify-center leading-none">
                        {activeFilterCount}
                      </span>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="w-[290px] bg-gray-950 border-gray-800/60 p-0 overflow-y-auto"
                >
                  <SheetHeader className="px-4 py-3 border-b border-gray-800/60">
                    <SheetTitle className="text-white text-base">
                      Filters
                      {activeFilterCount > 0 && (
                        <span className="ml-2 text-xs text-blue-400 font-normal">
                          {activeFilterCount} active
                        </span>
                      )}
                    </SheetTitle>
                  </SheetHeader>
                  <div className="p-4">
                    <InventoryFilters
                      onFilterChange={setFilters}
                      storageUnitNames={[]}
                    />
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            {loading ? (
              <LoadingInventory />
            ) : (
              <>
                <InventoryGrid
                  items={items}
                  filters={filters}
                  onTotalValueChange={handleTotalValueChange}
                  visibleItems={visibleItems}
                  onFilteredItemsChange={handleFilteredItemsChange}
                  onSelectItem={handleSelectItem}
                  selectedItemIds={selectedItems.map((item) => item.id)}
                  error={error}
                  currencies={currencies}
                  selectedCurrency={selectedCurrency}
                  setLoading={setLoading}
                  setError={setError}
                  setStorageUnits={setStorageUnits}
                  setItems={setItems}
                  setTotalFilteredItems={setFilteredItems}
                  setFilteredValue={setFilteredValue}
                  loginType={loginType}
                />

                {filteredItems.length > 0 &&
                  visibleItems < filteredItems.length && (
                    <div className="mt-6 flex justify-center pb-8">
                      <Button
                        onClick={handleShowMore}
                        variant="outline"
                        className="gap-2 border-gray-700 bg-gray-900/60 hover:bg-gray-800 text-white"
                      >
                        Show More
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
              </>
            )}
          </div>
        </div>
      </main>

      <footer className="bg-gray-950/80 border-t border-white/5 py-5">
        <div className="container mx-auto px-6 flex items-center justify-between text-sm text-gray-500">
          <Link
            href="https://github.com/maxtmiller"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-300 transition-colors"
            aria-label="GitHub"
          >
            <Github className="h-5 w-5" />
          </Link>
          <p className="text-center text-sm text-gray-600">
            © 2025 CS2 Vault · Not affiliated with Valve or Steam
          </p>
          <Link
            href="https://steamcommunity.com/id/LowKey-W-Loki/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-300 transition-colors"
            aria-label="Steam"
          >
            <SteamIcon className="h-5 w-5" />
          </Link>
        </div>
      </footer>
    </div>
  );
}
