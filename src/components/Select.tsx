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
  title,
  searchPlaceholder = "Search options...",
  searchable,
  disabled = false,
  className = "",
  variant = "default",
}: SelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
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

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      // Slight delay for smooth sheet animation before focus
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
    <div className="w-full">
      {label && (
        <label className="text-xs text-gray-500 font-medium block mb-2">
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        className={`${getTriggerClass()} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${className}`}
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

      {/* Bottom Sheet Modal Dropdown */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center backdrop-blur-[1px] animate-in fade-in"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-white rounded-t-3xl w-full max-w-md p-4 pb-6 shadow-2xl flex flex-col max-h-[82vh] animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Handle */}
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3 flex-shrink-0" />

            {/* Header */}
            <div className="flex items-center justify-between pb-2 mb-1 flex-shrink-0 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900 tracking-tight">
                {title || label || placeholder}
              </h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center transition-colors"
                title="Close"
              >
                <X size={14} />
              </button>
            </div>

            {/* Search Bar */}
            {showSearch && (
              <div className="relative my-2.5 flex-shrink-0">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-gray-400 transition-colors"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      searchInputRef.current?.focus();
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}

            {/* Scrollable Options List */}
            <div className="flex-1 overflow-y-auto slim-scrollbar min-h-0 space-y-1 py-1 pr-0.5 max-h-72">
              {filteredOptions.length === 0 ? (
                <div className="py-8 text-center text-xs text-gray-400">
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
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-sm transition-all ${
                        opt.disabled
                          ? "opacity-40 cursor-not-allowed"
                          : isSelected
                          ? "bg-gray-900 text-white font-semibold shadow-xs"
                          : "text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
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
                              className={`text-[11px] block truncate ${
                                isSelected ? "text-gray-300" : "text-gray-400"
                              }`}
                            >
                              {opt.sublabel}
                            </span>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <Check size={16} className="text-white flex-shrink-0 ml-2" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

