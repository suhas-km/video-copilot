"use client";

import { cn } from "@/utils/cn";
import { motion, useReducedMotion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { useMemo } from "react";

export interface TopNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  badge?: number;
  completed?: boolean;
}

interface TopNavigationProps {
  items: TopNavItem[];
  activeItem: string;
  onItemClick: (itemId: string) => void;
  className?: string;
}

export function TopNavigation({
  items,
  activeItem,
  onItemClick,
  className,
}: TopNavigationProps) {
  const reduceMotion = useReducedMotion();
  const activeIndex = useMemo(
    () => items.findIndex((item) => item.id === activeItem),
    [items, activeItem]
  );

  return (
    <motion.div
      className={cn(
        "fixed left-0 right-0 top-0 z-50 flex items-center justify-center py-3",
        className
      )}
    >
      <nav 
        className="flex h-14 items-center gap-1.5 rounded-2xl border border-white/15 bg-white/5 px-2 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
        role="tablist"
      >
        {items.map((item, index) => {
          const isActive = activeItem === item.id;
          const isCompleted = (item.completed ?? false) || index < activeIndex;
          const Icon = item.icon;

          return (
            <motion.button
              key={item.id}
              onClick={() => !item.disabled && onItemClick(item.id)}
              disabled={item.disabled}
              className={cn(
                "relative flex items-center justify-center gap-2.5 overflow-hidden px-6 py-2.5 text-sm font-medium",
                "rounded-xl transition-all duration-200",
                item.disabled && "cursor-not-allowed opacity-50",
                !item.disabled && [
                  isActive
                    ? "bg-white/20 text-white shadow-[0_0_20px_rgba(255,255,255,0.15),inset_0_1px_0_rgba(255,255,255,0.2)] border border-white/25"
                    : isCompleted
                      ? "text-white/80 hover:bg-white/10 hover:shadow-[0_0_15px_rgba(255,255,255,0.08)]"
                      : "text-white/60 hover:bg-white/10 hover:text-white/90 hover:shadow-[0_0_15px_rgba(255,255,255,0.08)]"
                ]
              )}
              role="tab"
              aria-selected={isActive}
              aria-disabled={item.disabled}
              whileHover={!item.disabled && !isActive ? { scale: 1.03 } : {}}
              whileTap={!item.disabled ? { scale: 0.97 } : {}}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04, duration: 0.2 }}
            >
              {/* Subtle glow overlay for active state */}
              {isActive && !item.disabled && (
                <motion.div
                  className="pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-b from-white/10 to-transparent"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: reduceMotion ? 0 : 0.3 }}
                />
              )}
              <div className="flex items-center gap-2">
                <motion.div
                  animate={{ scale: isActive ? 1.1 : 1 }}
                  transition={{ type: "spring", stiffness: 320, damping: 26 }}
                  className={cn(isActive && "drop-shadow-lg")}
                >
                  <Icon className="h-4 w-4" />
                </motion.div>
                <span className="hidden sm:inline">{item.label}</span>
              </div>
              {item.badge !== undefined && item.badge > 0 && (
                <motion.span
                  className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-lime-500 text-[9px] font-bold text-gray-900"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                >
                  {item.badge}
                </motion.span>
              )}
            </motion.button>
          );
        })}
      </nav>
    </motion.div>
  );
}
