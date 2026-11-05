import React, { useState, useMemo, useRef, useEffect } from "react";
import { ChevronDown, Search, X, Check } from "lucide-react";

export interface SelectOption<T = string> {
  value: T;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SelectProps<T = string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  label?: string;
  placeholder?: string;
  title?: string;
  searchPlaceholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
  variant?: "default" | "compact" | "transparent";
}

export function Select<T extends string | number>({
  value,
  onChange,
  options,
  label,
  placeholder = "Select...",
  searchPlaceholder = "Search options...",
  searchable,
  disabled = false,
  className = "",
  variant = "default",
}: SelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [openUpwards, setOpenUpwards] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = useMemo(
    () => options.find((o) => o.value === value),
    [options, value]
  );

  const showSearch = searchable !== undefined ? searchable : options.length > 5;

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sublabel && o.sublabel.toLowerCase().includes(q))
    );
  }, [options, search]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen]);

  // Check if dropdown should flip upwards when near bottom of viewport
  useEffect(() => {
    if (isOpen && containerRef.current) {
      setSearch("");
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      // If less than 240px below and more space above, open upwards
      setOpenUpwards(spaceBelow < 250 && rect.top > 250);

      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleSelect = (val: T, isDisabled?: boolean) => {
    if (isDisabled) return;
    onChange(val);
    setIsOpen(false);
  };

  const getTriggerClass = () => {
    if (variant === "compact") {
      return "w-full px-3 py-2 bg-gray-50 hover:bg-gray-100/80 rounded-lg text-sm border border-gray-100 font-medium flex items-center justify-between transition-colors";
    }
    if (variant === "transparent") {
      return "w-full text-sm text-gray-900 bg-transparent outline-none font-medium flex items-center justify-between";
    }
    // Default
    return "w-full px-3.5 py-2.5 bg-gray-50 hover:bg-gray-100/80 rounded-xl text-sm border border-gray-100 font-medium flex items-center justify-between transition-colors";
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {label && (
        <label className="text-xs text-gray-500 font-medium block mb-2">
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`${getTriggerClass()} ${
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
        } ${className}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 text-left truncate">
          {selectedOption?.icon && (
            <span className="flex-shrink-0">{selectedOption.icon}</span>
          )}
          <span
            className={`truncate ${
              selectedOption
                ? "text-gray-900 font-medium"
                : "text-gray-400 font-normal"
            }`}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <ChevronDown
          size={16}
          className={`text-gray-400 flex-shrink-0 ml-2 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Inline Floating Dropdown Menu */}
      {isOpen && (
        <div
          className={`absolute left-0 right-0 z-50 bg-white border border-gray-200/90 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
            openUpwards
              ? "bottom-full mb-1.5 origin-bottom"
              : "top-full mt-1.5 origin-top"
          }`}
        >
          {/* Search Bar inside popover */}
          {showSearch && (
            <div className="p-2 border-b border-gray-100 bg-gray-50/60">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full pl-8 pr-7 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-900 placeholder:text-gray-400 outline-none focus:border-gray-400 transition-colors"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      searchInputRef.current?.focus();
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Scrollable Options List with capped height and slim scrollbar */}
          <div className="overflow-y-auto slim-scrollbar p-1 max-h-56 divide-y divide-gray-50/50">
            {filteredOptions.length === 0 ? (
              <div className="py-5 text-center text-xs text-gray-400">
                No matching options found
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => handleSelect(opt.value, opt.disabled)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-left text-xs transition-colors ${
                      opt.disabled
                        ? "opacity-40 cursor-not-allowed"
                        : isSelected
                        ? "bg-gray-900 text-white font-semibold"
                        : "text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {opt.icon && (
                        <span
                          className={`flex-shrink-0 ${
                            isSelected ? "text-white" : "text-gray-500"
                          }`}
                        >
                          {opt.icon}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="block truncate">{opt.label}</span>
                        {opt.sublabel && (
                          <span
                            className={`text-[10px] block truncate ${
                              isSelected ? "text-gray-300" : "text-gray-400"
                            }`}
                          >
                            {opt.sublabel}
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <Check
                        size={14}
                        className="text-white flex-shrink-0 ml-1.5"
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
